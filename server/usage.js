import { queryAll, runSql } from './db.js';

const MODEL = process.env.JARVIS_REALTIME_MODEL || 'gpt-realtime-2.1';

const PRICING = {
  'gpt-realtime-2.1': {
    input_text: 4 / 1_000_000,
    input_text_cached: 0.40 / 1_000_000,
    input_audio: 32 / 1_000_000,
    input_audio_cached: 0.40 / 1_000_000,
    output_text: 24 / 1_000_000,
    output_audio: 64 / 1_000_000,
  },
  'gpt-realtime-2.1-mini': {
    input_text: 0.60 / 1_000_000,
    input_text_cached: 0.06 / 1_000_000,
    input_audio: 10 / 1_000_000,
    input_audio_cached: 0.30 / 1_000_000,
    output_text: 2.40 / 1_000_000,
    output_audio: 20 / 1_000_000,
  },
};

const rates = PRICING[MODEL] || PRICING['gpt-realtime-2.1'];
const CREDIT_BAR_MAX = Number(process.env.JARVIS_CREDIT_BAR_MAX || 500);
const FALLBACK_RPM_LIMIT = Number(process.env.JARVIS_RPM_LIMIT || 60);
export const OPENAI_BILLING_URL = 'https://platform.openai.com/settings/organization/billing/overview';

function envNumber(name, fallback) {
  const raw = process.env[name];
  if (raw == null || String(raw).trim() === '') return fallback;
  const n = Number(String(raw).trim().replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? n : fallback;
}

function readEnvCreditBalance() {
  return envNumber('JARVIS_CREDIT_BALANCE', null);
}

function fallbackCreditBudget() {
  return envNumber('JARVIS_CREDIT_BUDGET_USD', readEnvCreditBalance() ?? 20);
}

function isProjectKey(key) {
  return typeof key === 'string' && key.startsWith('sk-proj-');
}

function billingKeyCandidates() {
  const keys = [];
  const billing = process.env.OPENAI_BILLING_API_KEY?.trim();
  const main = process.env.OPENAI_API_KEY?.trim();
  if (billing) keys.push(billing);
  if (main && !keys.includes(main) && !isProjectKey(main)) keys.push(main);
  return keys;
}

function billingKey() {
  return billingKeyCandidates()[0] || null;
}

let detectedOrgId = process.env.OPENAI_ORG_ID?.trim() || null;

function billingOrgId() {
  return process.env.OPENAI_ORG_ID?.trim() || detectedOrgId || null;
}

function billingHeaders(key = billingKey()) {
  const headers = { Authorization: `Bearer ${key}` };
  const org = billingOrgId();
  if (org) headers['OpenAI-Organization'] = org;
  return headers;
}

function roundUsd(n) {
  return Math.round((n ?? 0) * 100) / 100;
}

let lastRateLimits = {
  requests: { limit: null, remaining: null, reset: null, updatedAt: null },
  tokens: { limit: null, remaining: null, reset: null, updatedAt: null },
};

let activeSessionStartedAt = null;
let pendingVoiceEstimate = 0;
let requestTimestamps = [];
let lastCredits = {
  total: null,
  used: null,
  remaining: null,
  resetAt: null,
  fetchedAt: null,
};

let creditBaseline = {
  remaining: null,
  resetAt: null,
  syncedAt: null,
  source: null,
};

let spendSinceBaseline = 0;
let baselineInitialized = false;

function usesStaticBillingBalance() {
  const src = creditBaseline.source;
  return src === 'env' || src === 'manual' || src === 'snapshot';
}

function initCreditBaseline() {
  const envBalance = readEnvCreditBalance();
  if (envBalance != null) {
    if (creditBaseline.remaining !== envBalance || creditBaseline.source !== 'env') {
      syncCreditBaseline(envBalance, utcMidnightMs(1), 'env');
    }
    return;
  }
  const snap = readDailyRecord('credit_snapshot');
  if (snap?.remaining != null && creditBaseline.remaining == null) {
    creditBaseline = {
      remaining: roundUsd(snap.remaining),
      resetAt: snap.resetAt ?? null,
      syncedAt: snap.at ?? Date.now(),
      source: snap.source ?? 'snapshot',
    };
  }
  const manual = readDailyRecord('manual_credit_balance');
  if (creditBaseline.remaining == null && manual?.balance != null) {
    syncCreditBaseline(manual.balance, manual.resetAt ?? utcMidnightMs(1), 'manual');
  }
}

function ensureCreditBaseline() {
  if (baselineInitialized) return;
  baselineInitialized = true;
  const storedOrg = readDailyRecord('openai_org_id');
  if (!detectedOrgId && storedOrg?.orgId) detectedOrgId = storedOrg.orgId;
  initCreditBaseline();
}

export function syncCreditBaseline(remaining, resetAt, source = creditBaseline.source) {
  if (remaining == null) return;
  creditBaseline = {
    remaining: roundUsd(remaining),
    resetAt: resetAt ?? creditBaseline.resetAt,
    syncedAt: Date.now(),
    source: source ?? creditBaseline.source ?? 'api',
  };
  spendSinceBaseline = 0;
  pendingVoiceEstimate = 0;
  writeDailyRecord('credit_snapshot', {
    remaining: creditBaseline.remaining,
    resetAt: creditBaseline.resetAt,
    source: creditBaseline.source,
    voiceTotalAtFetch: getAllTime('voice_usd'),
    at: creditBaseline.syncedAt,
  });
}

export function setManualCreditBalance(balance) {
  const value = roundUsd(Math.max(0, balance));
  writeDailyRecord('manual_credit_balance', {
    balance: value,
    resetAt: utcMidnightMs(1),
    at: Date.now(),
  });
  syncCreditBaseline(value, utcMidnightMs(1), 'manual');
  lastCredits.fetchedAt = Date.now();
  return getCreditsMeter();
}

export function getLiveCreditBalance() {
  const base = creditBaseline.remaining;
  if (base == null) return 0;
  // Billing overview balance only changes when OpenAI charges — don't subtract local estimates.
  if (usesStaticBillingBalance()) {
    return roundUsd(Math.max(0, Math.min(CREDIT_BAR_MAX, base)));
  }
  return roundUsd(Math.max(0, Math.min(CREDIT_BAR_MAX, base - spendSinceBaseline - pendingVoiceEstimate)));
}

export function getCreditsMeter() {
  ensureCreditBaseline();
  const balance = getLiveCreditBalance();
  return {
    label: 'Credits',
    unit: 'balance',
    balance,
    max: CREDIT_BAR_MAX,
    min: 0,
    ratio: ratio(balance, CREDIT_BAR_MAX),
    resetAt: creditBaseline.resetAt,
    syncedAt: creditBaseline.syncedAt,
    source: creditBaseline.source || (balance > 0 ? 'estimated' : 'unconfigured'),
    billingUrl: OPENAI_BILLING_URL,
    live: true,
  };
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function utcMidnightMs(offsetDays = 1) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime();
}

function readDailyRecord(key) {
  const rows = queryAll(
    "SELECT value FROM records WHERE category = 'usage' AND key = ? LIMIT 1",
    [key]
  );
  if (!rows.length) return null;
  try {
    return JSON.parse(rows[0]?.value || '{}');
  } catch {
    return null;
  }
}

function writeDailyRecord(key, data) {
  const existing = queryAll(
    "SELECT id FROM records WHERE category = 'usage' AND key = ? LIMIT 1",
    [key]
  );
  const payload = JSON.stringify(data);
  if (existing.length) {
    runSql("UPDATE records SET value = ?, created_at = datetime('now') WHERE id = ?", [payload, existing[0].id]);
  } else {
    runSql("INSERT INTO records (category, key, value) VALUES ('usage', ?, ?)", [key, payload]);
  }
}

function bumpDaily(field, amount = 0) {
  const day = todayKey();
  const key = `daily_${field}`;
  const current = readDailyRecord(key) || { day, value: 0 };
  const value = current.day === day ? current.value + amount : amount;
  writeDailyRecord(key, { day, value });
  return value;
}

function bumpAllTime(field, amount = 0) {
  const key = `alltime_${field}`;
  const current = readDailyRecord(key) || { value: 0 };
  writeDailyRecord(key, { value: (current.value || 0) + amount });
}

function getAllTime(field) {
  const current = readDailyRecord(`alltime_${field}`);
  return current?.value || 0;
}

function ratio(used, limit) {
  if (limit == null || limit <= 0) return null;
  return Math.min(1, Math.max(0, used / limit));
}

function parseUsdField(raw, { cents = false } = {}) {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'object') {
    const value = Number(raw.value ?? raw.amount ?? 0);
    if (!Number.isFinite(value)) return null;
    const unit = String(raw.currency ?? raw.unit ?? 'usd').toLowerCase();
    return unit === 'cent' || unit === 'cents' ? value / 100 : value;
  }
  const n = Number(String(raw).replace(/[^\d.-]/g, ''));
  if (!Number.isFinite(n)) return null;
  return cents ? n / 100 : n;
}

function grantAmount(grant) {
  return parseUsdField(grant.grant_amount ?? grant.amount ?? 0) ?? 0;
}

function grantUsed(grant) {
  return parseUsdField(grant.used_amount ?? 0) ?? 0;
}

function grantRemaining(grant) {
  const balance = parseUsdField(grant.balance ?? grant.remaining);
  if (balance != null) return Math.max(0, balance);
  return Math.max(0, grantAmount(grant) - grantUsed(grant));
}

export function parseResetToMs(raw) {
  if (raw == null || raw === '') return null;
  const s = String(raw).trim().toLowerCase();

  if (/^\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    if (n > 1e12) return n;
    if (n > 1e9) return n * 1000;
    return Date.now() + n * 1000;
  }

  let totalSec = 0;
  const h = s.match(/(\d+)\s*h/);
  const m = s.match(/(\d+)\s*m(?!s)/);
  const sec = s.match(/(\d+)\s*s/);
  if (h) totalSec += Number(h[1]) * 3600;
  if (m) totalSec += Number(m[1]) * 60;
  if (sec) totalSec += Number(sec[1]);
  if (totalSec > 0) return Date.now() + totalSec * 1000;

  const parsed = Date.parse(s);
  return Number.isFinite(parsed) ? parsed : null;
}

function pickResetAt(...candidates) {
  const now = Date.now();
  const times = candidates
    .map((c) => (typeof c === 'number' ? c : parseResetToMs(c)))
    .filter((t) => t != null && t > now);
  if (!times.length) return utcMidnightMs(1);
  return Math.min(...times);
}

function num(raw) {
  if (raw == null || raw === '') return null;
  const n = Number(String(raw).replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? n : null;
}

export function costFromUsage(usage) {
  if (!usage) return 0;

  const inDet = usage.input_token_details || {};
  const outDet = usage.output_token_details || {};
  const cachedDet = inDet.cached_tokens_details || {};

  const textIn = inDet.text_tokens || 0;
  const audioIn = inDet.audio_tokens || 0;
  const cachedText = cachedDet.text_tokens || 0;
  const cachedAudio = cachedDet.audio_tokens || 0;
  const textOut = outDet.text_tokens || 0;
  const audioOut = outDet.audio_tokens || 0;

  const uncachedTextIn = Math.max(0, textIn - cachedText);
  const uncachedAudioIn = Math.max(0, audioIn - cachedAudio);

  return (
    uncachedTextIn * rates.input_text
    + cachedText * rates.input_text_cached
    + uncachedAudioIn * rates.input_audio
    + cachedAudio * rates.input_audio_cached
    + textOut * rates.output_text
    + audioOut * rates.output_audio
  );
}

export function recordApiRequest() {
  const now = Date.now();
  requestTimestamps.push(now);
  requestTimestamps = requestTimestamps.filter((t) => now - t < 60_000);
}

function getLocalRpm() {
  const now = Date.now();
  requestTimestamps = requestTimestamps.filter((t) => now - t < 60_000);
  return requestTimestamps.length;
}

export function updateRateLimits(headers) {
  const pick = (prefix) => ({
    limit: num(headers.get(`x-ratelimit-limit-${prefix}`)),
    remaining: num(headers.get(`x-ratelimit-remaining-${prefix}`)),
    reset: headers.get(`x-ratelimit-reset-${prefix}`),
    updatedAt: Date.now(),
  });
  lastRateLimits = {
    requests: pick('requests'),
    tokens: pick('tokens'),
  };
  const orgHeader = headers.get('openai-organization')
    || headers.get('OpenAI-Organization')
    || headers.get('x-openai-organization');
  if (orgHeader?.startsWith('org-')) {
    detectedOrgId = orgHeader.trim();
    writeDailyRecord('openai_org_id', { orgId: detectedOrgId, at: Date.now() });
  }
  writeDailyRecord('rate_limits', lastRateLimits);
}

export function recordSessionConnect() {
  recordApiRequest();
  activeSessionStartedAt = Date.now();
  pendingVoiceEstimate = 0;
}

export function recordSessionEnd() {
  activeSessionStartedAt = null;
  pendingVoiceEstimate = 0;
}

export function trackVoiceUsage(usage) {
  recordApiRequest();
  const cost = costFromUsage(usage);
  if (cost > 0) {
    bumpDaily('voice_usd', cost);
    bumpAllTime('voice_usd', cost);
    spendSinceBaseline += cost;
    pendingVoiceEstimate = 0;
  }
  return { cost, credits: getCreditsMeter() };
}

export function setPendingVoiceEstimate(usd) {
  pendingVoiceEstimate = Math.max(0, usd);
}

async function fetchPendingUsageUsd(key) {
  const res = await fetch('https://api.openai.com/v1/dashboard/billing/pending_usage', {
    headers: billingHeaders(key),
  });
  if (!res.ok) return 0;
  const data = await res.json();
  return parseUsdField(data.total_usage ?? data.amount ?? data.pending_usage, { cents: true }) ?? 0;
}

async function fetchCreditsFromSubscription(key) {
  const res = await fetch('https://api.openai.com/v1/dashboard/billing/subscription', {
    headers: billingHeaders(key),
  });
  if (!res.ok) return null;

  const data = await res.json();
  const hardLimit = parseUsdField(data.hard_limit_usd ?? data.soft_limit_usd) ?? 0;
  const used = parseUsdField(data.system_usage?.total_usage ?? data.total_usage, { cents: true }) ?? 0;
  if (hardLimit > 0) {
    return {
      total: hardLimit,
      used,
      remaining: Math.max(0, hardLimit - used),
      resetAt: utcMidnightMs(1),
    };
  }
  return null;
}

async function fetchCreditsFromGrants(key) {
  const res = await fetch('https://api.openai.com/v1/dashboard/billing/credit_grants', {
    headers: billingHeaders(key),
  });

  if (!res.ok) return null;

  const data = await res.json();
  const totalAvailable = parseUsdField(data.total_available ?? data.total_paid_available);
  const totalGranted = parseUsdField(data.total_granted);
  const totalUsed = parseUsdField(data.total_used);

  if (totalAvailable != null) {
    let remaining = totalAvailable;
    try {
      const pending = await fetchPendingUsageUsd(key);
      remaining = Math.max(0, totalAvailable - pending);
    } catch { /* optional */ }

    const total = totalGranted ?? (totalUsed != null ? totalUsed + remaining : remaining);
    const used = totalUsed ?? (total != null ? Math.max(0, total - remaining) : null);
    const resetTimes = (data.grants?.data || []).map((g) => g.expires_at).filter(Boolean);
    return {
      total: total ?? remaining,
      used,
      remaining,
      resetAt: pickResetAt(...resetTimes.map((t) => Number(t) * 1000), utcMidnightMs(1)),
    };
  }

  const grants = data.grants?.data || data.data || [];
  if (!grants.length) return null;

  let total = 0;
  let remaining = 0;
  const resetTimes = [];

  for (const grant of grants) {
    const amount = grantAmount(grant);
    const balance = grantRemaining(grant);
    total += amount;
    remaining += balance;
    if (grant.expires_at) resetTimes.push(Number(grant.expires_at) * 1000);
  }

  return {
    total: total || remaining,
    used: total ? Math.max(0, total - remaining) : null,
    remaining,
    resetAt: pickResetAt(...resetTimes, utcMidnightMs(1)),
  };
}

async function fetchCreditsFromBillingApi() {
  for (const key of billingKeyCandidates()) {
    try {
      const grants = await fetchCreditsFromGrants(key);
      if (grants?.remaining != null) return grants;
      const subscription = await fetchCreditsFromSubscription(key);
      if (subscription?.remaining != null) return subscription;
    } catch { /* try next key */ }
  }
  return null;
}

async function fetchCreditsFromOrgCosts() {
  const adminKey = process.env.OPENAI_ADMIN_API_KEY?.trim();
  if (!adminKey) return null;

  const budget = readEnvCreditBalance() ?? fallbackCreditBudget();
  const now = Math.floor(Date.now() / 1000);
  const start = now - 30 * 24 * 3600;
  const headers = { Authorization: `Bearer ${adminKey}` };
  const org = billingOrgId();
  if (org) headers['OpenAI-Organization'] = org;

  const res = await fetch(
    `https://api.openai.com/v1/organization/costs?start_time=${start}&end_time=${now}&limit=31`,
    { headers }
  );
  if (!res.ok) return null;

  const data = await res.json();
  const buckets = data.data || [];
  if (!buckets.length) return null;

  let spent = 0;
  for (const bucket of buckets) {
    spent += parseUsdField(bucket.amount?.value ?? bucket.amount) ?? 0;
  }

  const remaining = Math.max(0, budget - spent);
  return {
    total: budget,
    used: Math.min(budget, spent),
    remaining,
    resetAt: utcMidnightMs(1),
  };
}

async function fetchCredits(force = false) {
  if (!force && lastCredits.fetchedAt && Date.now() - lastCredits.fetchedAt < 60_000) {
    return lastCredits;
  }

  try {
    const billing = billingKeyCandidates().length ? await fetchCreditsFromBillingApi() : null;
    const org = billing ? null : await fetchCreditsFromOrgCosts();

    if (billing?.remaining != null) {
      lastCredits = {
        total: billing.total,
        used: billing.used,
        remaining: billing.remaining,
        resetAt: billing.resetAt,
        fetchedAt: Date.now(),
      };
      syncCreditBaseline(billing.remaining, billing.resetAt, 'api');
    } else if (org?.remaining != null) {
      lastCredits = {
        total: org.total,
        used: org.used,
        remaining: org.remaining,
        resetAt: org.resetAt,
        fetchedAt: Date.now(),
      };
      syncCreditBaseline(org.remaining, org.resetAt, 'admin');
    } else {
      ensureCreditBaseline();
      const envBalance = readEnvCreditBalance();
      if (creditBaseline.remaining == null && envBalance != null) {
        syncCreditBaseline(envBalance, utcMidnightMs(1), 'env');
      }
    }
  } catch {
    ensureCreditBaseline();
  }

  return lastCredits;
}

function buildRpmMeter(req, resetAt) {
  const localRpm = getLocalRpm();
  const limit = req.limit ?? FALLBACK_RPM_LIMIT;
  const remaining = req.remaining;

  if (remaining != null && req.limit != null) {
    const used = Math.max(0, req.limit - remaining);
    return {
      label: 'RPM',
      unit: 'rpm',
      used,
      limit: req.limit,
      remaining,
      ratio: ratio(used, req.limit),
      resetAt: resetAt ?? parseResetToMs(req.reset),
    };
  }

  return {
    label: 'RPM',
    unit: 'rpm',
    used: localRpm,
    limit,
    remaining: Math.max(0, limit - localRpm),
    ratio: ratio(localRpm, limit),
    resetAt: resetAt ?? parseResetToMs(req.reset) ?? utcMidnightMs(0),
  };
}

export async function startQuietCreditSync() {
  const tick = () => fetchCredits(true).catch(() => {});
  tick();
  setInterval(tick, 60_000);
}

export async function getCreditsSnapshot(forceSync = false) {
  const stale = !creditBaseline.syncedAt || Date.now() - creditBaseline.syncedAt > 60_000;
  if (forceSync || stale) {
    await fetchCredits(forceSync || stale);
  }
  return getCreditsMeter();
}

export async function getUsageSnapshot() {
  const stored = readDailyRecord('rate_limits');
  if (stored?.requests) lastRateLimits = stored;

  await fetchCredits(false);
  const rpmReset = pickResetAt(
    parseResetToMs(lastRateLimits.requests.reset),
    utcMidnightMs(0)
  );

  const creditsMeter = getCreditsMeter();
  const sessionMeter = buildRpmMeter(lastRateLimits.requests, rpmReset);

  return {
    credits: creditsMeter,
    session: sessionMeter,
    resetAt: creditsMeter.resetAt,
    updatedAt: Date.now(),
  };
}

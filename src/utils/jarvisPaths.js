import { existsSync, readdirSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { isAbsolute, join, resolve } from 'path';

export const PROJECT_PACKAGE_NAME = 'jarvis-mark1';

export const PROJECT_FOLDER_NAMES = [
  'Jarvis(Mark1)',
  'Jarvis (Mark 1)',
  'Jarvis-Mark1',
  'Jarvis Mark 1',
  'jarvis-mark1',
  'Jarvis',
];

export const DESKTOP_SHORTCUT_NAMES = [
  'Jarvis(Mark1).lnk',
  'Jarvis.lnk',
];

function uniqueExisting(paths, exists = existsSync) {
  const seen = new Set();
  const out = [];
  for (const p of paths) {
    if (!p) continue;
    const normalized = resolve(p);
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    if (exists(normalized)) out.push(normalized);
  }
  return out;
}

export function expandWindowsEnv(inputPath, env = process.env) {
  if (!inputPath) return inputPath;
  return inputPath.replace(/%([^%]+)%/g, (_, name) => {
    const value = env[name] ?? env[name.toUpperCase()] ?? env[name.toLowerCase()];
    return value == null ? `%${name}%` : value;
  });
}

export function normalizePathInput(inputPath) {
  if (!inputPath) return inputPath;
  if (/^\\\\/.test(inputPath)) return inputPath;
  return inputPath.replace(/\\/g, '/');
}

export function defaultDriveRoot(env = process.env, platform = process.platform) {
  const raw = env.JARVIS_DRIVE_ROOT || env.SystemDrive || env.SYSTEMDRIVE
    || (platform === 'win32' ? 'C:' : null);
  if (!raw) return null;
  return /[\\/]$/.test(raw) ? raw : `${raw}\\`;
}

export function desktopCandidateDirs({
  home = homedir(),
  env = process.env,
  exists = existsSync,
} = {}) {
  const candidates = [
    env.JARVIS_DESKTOP,
    join(home, 'Desktop'),
    join(home, 'OneDrive', 'Desktop'),
    env.USERPROFILE && join(env.USERPROFILE, 'Desktop'),
    env.USERPROFILE && join(env.USERPROFILE, 'OneDrive', 'Desktop'),
    env.USERPROFILE && join(env.USERPROFILE, 'OneDrive - Personal', 'Desktop'),
    env.OneDrive && join(env.OneDrive, 'Desktop'),
    env.ONEDRIVE && join(env.ONEDRIVE, 'Desktop'),
    env.PUBLIC && join(env.PUBLIC, 'Desktop'),
  ];
  return uniqueExisting(candidates, exists);
}

export function driveProjectCandidateDirs({
  driveRoot,
  env = process.env,
  exists = existsSync,
  platform = process.platform,
} = {}) {
  const root = driveRoot ?? defaultDriveRoot(env, platform);
  if (!root) return [];
  return uniqueExisting(
    PROJECT_FOLDER_NAMES.map((name) => join(root, name)),
    exists,
  );
}

export function looksLikeJarvisRoot(dir, {
  exists = existsSync,
  readFile = readFileSync,
} = {}) {
  if (!dir) return false;
  const pkgPath = join(dir, 'package.json');
  if (exists(pkgPath)) {
    try {
      const pkg = JSON.parse(readFile(pkgPath, 'utf8'));
      if (pkg?.name === PROJECT_PACKAGE_NAME) return true;
    } catch {
      /* ignore unreadable package.json */
    }
  }
  return exists(join(dir, 'scripts', 'Jarvis.bat'))
    && exists(join(dir, 'electron', 'main.cjs'));
}

export function findNamedProjectOnDesktops(desktopDirs, {
  exists = existsSync,
  readFile = readFileSync,
  names = PROJECT_FOLDER_NAMES,
} = {}) {
  for (const desktop of desktopDirs) {
    for (const name of names) {
      const candidate = join(desktop, name);
      if (looksLikeJarvisRoot(candidate, { exists, readFile })) return candidate;
    }
  }
  return null;
}

export function scanDesktopsForJarvis(desktopDirs, {
  exists = existsSync,
  readFile = readFileSync,
  readDir = readdirSync,
} = {}) {
  const named = findNamedProjectOnDesktops(desktopDirs, { exists, readFile });
  if (named) return named;

  for (const desktop of desktopDirs) {
    let entries = [];
    try {
      entries = readDir(desktop);
    } catch {
      continue;
    }
    for (const name of entries) {
      if (!/jarvis/i.test(name)) continue;
      const candidate = join(desktop, name);
      if (looksLikeJarvisRoot(candidate, { exists, readFile })) return candidate;
    }
  }
  return null;
}

export function findJarvisRoot({
  hint,
  cwd = process.cwd(),
  home = homedir(),
  env = process.env,
  exists = existsSync,
  readFile = readFileSync,
  readDir = readdirSync,
  driveRoot,
  platform = process.platform,
} = {}) {
  if (env.JARVIS_ROOT && looksLikeJarvisRoot(normalizePathInput(env.JARVIS_ROOT), { exists, readFile })) {
    return resolve(normalizePathInput(env.JARVIS_ROOT));
  }

  const hints = [hint, cwd].filter(Boolean);
  for (const start of hints) {
    const resolved = resolve(start);
    if (looksLikeJarvisRoot(resolved, { exists, readFile })) return resolved;
    const parent = resolve(resolved, '..');
    if (looksLikeJarvisRoot(parent, { exists, readFile })) return parent;
  }

  const root = driveRoot ?? defaultDriveRoot(env, platform);
  if (root) {
    const fromDrive = scanDesktopsForJarvis([root], { exists, readFile, readDir });
    if (fromDrive) return fromDrive;
  }

  const desktops = desktopCandidateDirs({ home, env, exists });
  const fromDesktop = scanDesktopsForJarvis(desktops, { exists, readFile, readDir });
  if (fromDesktop) return fromDesktop;

  return null;
}

export function findJarvisDesktopShortcut({
  home = homedir(),
  env = process.env,
  exists = existsSync,
} = {}) {
  const desktops = desktopCandidateDirs({ home, env, exists });
  for (const desktop of desktops) {
    for (const name of DESKTOP_SHORTCUT_NAMES) {
      const shortcut = join(desktop, name);
      if (exists(shortcut)) return shortcut;
    }
  }
  return null;
}

export function resolveUserPath(inputPath, {
  home = homedir(),
  env = process.env,
  exists = existsSync,
  readFile = readFileSync,
  readDir = readdirSync,
  cwd = process.cwd(),
} = {}) {
  if (!inputPath) return resolve(cwd);
  let expanded = normalizePathInput(expandWindowsEnv(String(inputPath).trim(), env));
  expanded = expanded.replace(/^~(?=$|[\\/])/, home);

  const desktops = desktopCandidateDirs({ home, env, exists });
  const desktopAlias = expanded.match(/^(?:desktop)(?=$|[\\/])(.*)$/i);
  if (desktopAlias) {
    const rest = desktopAlias[1].replace(/^[\\/]+/, '');
    const tried = [];
    for (const desktop of desktops) {
      const candidate = rest ? join(desktop, rest) : desktop;
      tried.push(candidate);
      if (exists(candidate)) return resolve(candidate);
    }
    if (tried.length) return resolve(tried[0]);
  }

  if (!isAbsolute(expanded) && /jarvis/i.test(expanded) && !expanded.includes('/') && !expanded.includes('\\')) {
    const found = findJarvisRoot({ hint: expanded, cwd, home, env, exists, readFile, readDir });
    if (found) return found;
  }

  return resolve(expanded);
}

export function describeJarvisLaunchPaths(options = {}) {
  const root = findJarvisRoot(options);
  const shortcut = findJarvisDesktopShortcut(options);
  const desktops = desktopCandidateDirs(options);
  const launcher = root ? join(root, 'scripts', 'Jarvis.vbs') : null;
  const bat = root ? join(root, 'scripts', 'Jarvis.bat') : null;
  const envFile = root ? join(root, '.env') : null;
  const envExists = envFile ? (options.exists || existsSync)(envFile) : false;

  return {
    projectRoot: root,
    driveDirs: driveProjectCandidateDirs(options),
    desktopDirs: desktops,
    desktopShortcut: shortcut,
    windowsLauncher: launcher,
    windowsBat: bat,
    envFile,
    envReady: envExists,
    openaiRequired: true,
    launchCommand: 'npm run dev',
  };
}

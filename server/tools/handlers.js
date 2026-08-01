import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync, existsSync } from 'fs';
import screenshot from 'screenshot-desktop';
import OpenAI from 'openai';
import { getDb, queryAll, runSql } from '../db.js';
import { broadcast } from '../events.js';
import * as files from './files.js';
import * as browser from './browser.js';
import * as appearance from './appearance.js';

const execAsync = promisify(exec);
const __dirname = dirname(fileURLToPath(import.meta.url));
const screenshotDir = join(__dirname, '..', '..', 'screenshots');

if (!existsSync(screenshotDir)) mkdirSync(screenshotDir, { recursive: true });

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const pendingConfirmations = new Map();

export async function executeTool(name, args) {
  switch (name) {
    case 'web_search': return webSearch(args);
    case 'generate_image': return generateImage(args);
    case 'show_mermaid': return showMermaid(args);
    case 'show_artifact': return showArtifact(args);
    case 'note_create': return noteCreate(args);
    case 'note_search': return noteSearch(args);
    case 'note_edit': return noteEdit(args);
    case 'note_delete': return noteDelete(args);
    case 'db_query': return dbQuery(args);
    case 'db_execute': return dbExecute(args);
    case 'request_confirmation': return requestConfirmation(args);
    case 'open_app': return openApp(args);
    case 'computer_action': return computerAction(args);
    case 'read_screen': return readScreen(args);
    case 'file_read': return files.fileRead(args);
    case 'file_write': return files.fileWrite(args);
    case 'file_move': return files.fileMove(args);
    case 'file_copy': return files.fileCopy(args);
    case 'file_delete': return files.fileDelete(args);
    case 'file_list': return files.fileList(args);
    case 'file_search': return files.fileSearch(args);
    case 'open_url': return browser.openUrl(args);
    case 'google_search': return browser.googleSearch(args);
    case 'set_appearance': return appearance.setAppearance(args);
    case 'window_control': return appearance.windowControl(args);
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

async function webSearch({ query, num_results = 5 }) {
  if (!process.env.EXA_API_KEY) {
    await browser.googleSearch({ query });
    return { results: [], message: 'Opened Google search in browser. Add EXA_API_KEY for inline results.' };
  }

  const res = await fetch('https://api.exa.ai/search', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.EXA_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query,
      numResults: num_results,
      contents: { text: { maxCharacters: 500 } },
    }),
  });

  if (!res.ok) {
    return { error: 'EXA search failed', status: res.status };
  }

  const data = await res.json();
  const results = (data.results || []).map((r) => ({
    title: r.title,
    url: r.url,
    snippet: r.text?.slice(0, 300) || '',
  }));

  broadcast({
    type: 'artifact',
    data: { type: 'web_results', title: `Search: ${query}`, content: JSON.stringify(results) },
  });

  return { results };
}

async function generateImage({ prompt, size = '1024x1024' }) {
  const response = await openai.images.generate({
    model: 'dall-e-3',
    prompt,
    n: 1,
    size,
  });

  const url = response.data[0]?.url;
  broadcast({
    type: 'artifact',
    data: { type: 'image', title: prompt.slice(0, 60), content: url },
  });

  return { url, prompt };
}

function showMermaid({ title = 'Diagram', code }) {
  broadcast({
    type: 'artifact',
    data: { type: 'mermaid', title, content: code },
  });
  return { success: true, title };
}

function showArtifact({ type, title, content, language }) {
  broadcast({
    type: 'artifact',
    data: { type, title, content, language },
  });
  return { success: true, type, title };
}

function noteCreate({ title, body, emoji = '📝' }) {
  const result = runSql('INSERT INTO notes (title, body, emoji) VALUES (?, ?, ?)', [title, body, emoji]);
  const notes = queryAll('SELECT * FROM notes ORDER BY updated_at DESC LIMIT 20');
  broadcast({
    type: 'artifact',
    data: { type: 'notes_list', title: 'Notes', content: JSON.stringify(notes) },
  });
  return { id: result.lastInsertRowid, title };
}

function noteSearch({ query }) {
  const notes = queryAll(
    "SELECT * FROM notes WHERE title LIKE ? OR body LIKE ? ORDER BY updated_at DESC",
    [`%${query}%`, `%${query}%`]
  );
  broadcast({
    type: 'artifact',
    data: { type: 'notes_list', title: `Notes: "${query}"`, content: JSON.stringify(notes) },
  });
  return { notes };
}

function noteEdit({ id, title, body, emoji }) {
  const existing = queryAll('SELECT * FROM notes WHERE id = ?', [id])[0];
  if (!existing) return { error: 'Note not found' };

  runSql(
    "UPDATE notes SET title = ?, body = ?, emoji = ?, updated_at = datetime('now') WHERE id = ?",
    [title ?? existing.title, body ?? existing.body, emoji ?? existing.emoji, id]
  );

  const notes = queryAll('SELECT * FROM notes ORDER BY updated_at DESC LIMIT 20');
  broadcast({
    type: 'artifact',
    data: { type: 'notes_list', title: 'Notes', content: JSON.stringify(notes) },
  });
  return { id, updated: true };
}

async function noteDelete({ id }) {
  runSql('DELETE FROM notes WHERE id = ?', [id]);
  const notes = queryAll('SELECT * FROM notes ORDER BY updated_at DESC LIMIT 20');
  broadcast({
    type: 'artifact',
    data: { type: 'notes_list', title: 'Notes', content: JSON.stringify(notes) },
  });
  return { deleted: id };
}

function dbQuery({ sql }) {
  if (!/^\s*SELECT/i.test(sql)) {
    return { error: 'db_query only allows SELECT statements' };
  }
  try {
    const rows = queryAll(sql);
    broadcast({
      type: 'artifact',
      data: { type: 'table', title: 'Query results', content: JSON.stringify(rows) },
    });
    return { rows, count: rows.length };
  } catch (err) {
    return { error: err.message };
  }
}

async function dbExecute({ sql, description }) {
  try {
    const result = runSql(sql);
    return { changes: result.changes, description };
  } catch (err) {
    return { error: err.message };
  }
}

function requestConfirmation({ action_id, message, action_type, _payload }) {
  pendingConfirmations.set(action_id, _payload || null);
  getDb().run(
    'INSERT OR REPLACE INTO pending_actions (id, action_type, message, payload) VALUES (?, ?, ?, ?)',
    [action_id, action_type, message, JSON.stringify(_payload || {})]
  );

  broadcast({
    type: 'confirmation',
    data: { action_id, message, action_type },
  });

  return {
    status: 'awaiting_confirmation',
    action_id,
    message: 'Waiting for user confirmation. Ask them to say yes or click Confirm.',
  };
}

export async function resolveConfirmation(action_id, approved) {
  const payload = pendingConfirmations.get(action_id);
  pendingConfirmations.delete(action_id);
  getDb().run("UPDATE pending_actions SET status = ? WHERE id = ?", [approved ? 'approved' : 'denied', action_id]);

  if (!approved) return { status: 'denied', action_id };
  if (!payload) return { status: 'approved', action_id, message: 'Confirmed (no follow-up action stored)' };

  pendingConfirmations.set(action_id, payload);
  const result = await executeTool(payload.tool, payload.args);
  pendingConfirmations.delete(action_id);
  return { status: 'approved', action_id, result };
}

async function openApp({ app_name }) {
  if (/^https?:\/\//i.test(app_name)) {
    return browser.openUrl({ url: app_name });
  }
  const platform = process.platform;
  try {
    if (platform === 'win32') {
      await execAsync(`start "" "${app_name}"`, { shell: 'cmd.exe' });
    } else if (platform === 'darwin') {
      await execAsync(`open -a "${app_name}"`);
    } else {
      await execAsync(app_name);
    }
    return { opened: app_name };
  } catch (err) {
    return { error: `Could not open ${app_name}: ${err.message}` };
  }
}

async function computerAction(args) {
  const { action } = args;

  // Use PowerShell for Windows automation (no native deps)
  try {
    switch (action) {
      case 'click': {
        const ps = `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${args.x}, ${args.y}); Start-Sleep -Milliseconds 100; Add-Type -MemberDefinition '[DllImport("user32.dll")] public static extern void mouse_event(int dwFlags, int dx, int dy, int cButtons, int dwExtraInfo);' -Name U32 -Namespace W; [W.U32]::mouse_event(0x02,0,0,0,0); [W.U32]::mouse_event(0x04,0,0,0,0)`;
        await execAsync(`powershell -Command "${ps.replace(/"/g, '\\"')}"`);
        return { clicked: { x: args.x, y: args.y } };
      }
      case 'type': {
        const escaped = (args.text || '').replace(/'/g, "''");
        await execAsync(`powershell -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${escaped}')"`);
        return { typed: args.text };
      }
      case 'scroll': {
        const delta = args.direction === 'up' ? 120 : -120;
        const ps = `Add-Type -MemberDefinition '[DllImport("user32.dll")] public static extern void mouse_event(int dwFlags, int dx, int dy, int cButtons, int dwExtraInfo);' -Name U32 -Namespace W; [W.U32]::mouse_event(0x0800,0,0,${delta},0)`;
        await execAsync(`powershell -Command "${ps}"`);
        return { scrolled: args.direction };
      }
      case 'hotkey': {
        const key = (args.keys || '').replace(/\+/g, '+');
        await execAsync(`powershell -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('^${key.replace('ctrl+', '')}')"`);
        return { hotkey: args.keys };
      }
      case 'screenshot':
        return readScreen({ region: 'full' });
      default:
        return { error: 'Unknown action' };
    }
  } catch (err) {
    return { error: err.message };
  }
}

async function readScreen({ region = 'full' }) {
  const filename = `screen_${Date.now()}.png`;
  const filepath = join(screenshotDir, filename);
  await screenshot({ filename: filepath });

  broadcast({
    type: 'artifact',
    data: { type: 'image', title: 'Screen capture', content: `http://localhost:${process.env.PORT || 3847}/screenshots/${filename}` },
  });

  // Use vision to describe screen
  try {
    const fs = await import('fs');
    const b64 = fs.readFileSync(filepath).toString('base64');
    const vision = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: 'Briefly describe what is visible on this screen. Focus on actionable UI elements.' },
          { type: 'image_url', image_url: { url: `data:image/png;base64,${b64}` } },
        ],
      }],
      max_tokens: 300,
    });
    const description = vision.choices[0]?.message?.content || '';
    return { screenshot: filepath, description, region };
  } catch {
    return { screenshot: filepath, region };
  }
}

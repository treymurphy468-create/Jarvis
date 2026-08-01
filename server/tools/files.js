import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync, renameSync, copyFileSync, unlinkSync, existsSync } from 'fs';
import { join, resolve, dirname, basename } from 'path';
import { homedir } from 'os';
import { broadcast } from '../events.js';

function resolvePath(inputPath) {
  const expanded = inputPath.replace(/^~/, homedir());
  return resolve(expanded);
}

export function fileRead({ path, max_chars = 50000 }) {
  const full = resolvePath(path);
  if (!existsSync(full)) return { error: `File not found: ${full}` };
  const stat = statSync(full);
  if (!stat.isFile()) return { error: 'Path is not a file' };
  const content = readFileSync(full, 'utf8');
  const truncated = content.length > max_chars;
  const text = truncated ? content.slice(0, max_chars) : content;
  broadcast({
    type: 'artifact',
    data: { type: 'code', title: basename(full), content: text, language: guessLang(full) },
  });
  return { path: full, size: stat.size, truncated, preview: text.slice(0, 500) };
}

export function fileWrite({ path, content, append = false }) {
  const full = resolvePath(path);
  mkdirSync(dirname(full), { recursive: true });
  if (append && existsSync(full)) {
    writeFileSync(full, readFileSync(full, 'utf8') + content, 'utf8');
  } else {
    writeFileSync(full, content, 'utf8');
  }
  return { path: full, bytes: Buffer.byteLength(content, 'utf8'), append };
}

export function fileMove({ from, to }) {
  const src = resolvePath(from);
  const dest = resolvePath(to);
  if (!existsSync(src)) return { error: `Source not found: ${src}` };
  mkdirSync(dirname(dest), { recursive: true });
  renameSync(src, dest);
  return { from: src, to: dest };
}

export function fileCopy({ from, to }) {
  const src = resolvePath(from);
  const dest = resolvePath(to);
  if (!existsSync(src)) return { error: `Source not found: ${src}` };
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(src, dest);
  return { from: src, to: dest };
}

export function fileDelete({ path }) {
  const full = resolvePath(path);
  if (!existsSync(full)) return { error: `Not found: ${full}` };
  unlinkSync(full);
  return { deleted: full };
}

export function fileList({ path = '~', recursive = false, max_entries = 100 }) {
  const full = resolvePath(path);
  if (!existsSync(full)) return { error: `Not found: ${full}` };
  const stat = statSync(full);
  if (!stat.isDirectory()) return { error: 'Path is not a directory' };

  const entries = [];
  const walk = (dir, depth) => {
    if (entries.length >= max_entries) return;
    for (const name of readdirSync(dir)) {
      if (entries.length >= max_entries) break;
      const p = join(dir, name);
      try {
        const s = statSync(p);
        entries.push({
          name,
          path: p,
          type: s.isDirectory() ? 'dir' : 'file',
          size: s.isFile() ? s.size : null,
        });
        if (recursive && s.isDirectory() && depth < 3) walk(p, depth + 1);
      } catch { /* skip inaccessible */ }
    }
  };
  walk(full, 0);

  broadcast({
    type: 'artifact',
    data: { type: 'table', title: `Files: ${full}`, content: JSON.stringify(entries) },
  });
  return { path: full, entries, count: entries.length };
}

export function fileSearch({ path = '~', query, max_results = 50 }) {
  const full = resolvePath(path);
  if (!existsSync(full)) return { error: `Not found: ${full}` };
  const q = query.toLowerCase();
  const matches = [];

  const walk = (dir) => {
    if (matches.length >= max_results) return;
    for (const name of readdirSync(dir)) {
      if (matches.length >= max_results) break;
      const p = join(dir, name);
      try {
        const s = statSync(p);
        if (name.toLowerCase().includes(q)) {
          matches.push({ name, path: p, type: s.isDirectory() ? 'dir' : 'file' });
        }
        if (s.isDirectory()) walk(p);
      } catch { /* skip */ }
    }
  };
  walk(full);

  broadcast({
    type: 'artifact',
    data: { type: 'table', title: `Search: "${query}"`, content: JSON.stringify(matches) },
  });
  return { query, matches, count: matches.length };
}

function guessLang(filePath) {
  const ext = filePath.split('.').pop()?.toLowerCase();
  const map = { js: 'javascript', jsx: 'javascript', ts: 'typescript', py: 'python', json: 'json', md: 'markdown', html: 'html', css: 'css' };
  return map[ext] || 'text';
}

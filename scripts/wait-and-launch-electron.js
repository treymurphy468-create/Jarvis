import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { waitForHttpOk } from '../src/utils/waitForHealth.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const waitOpts = { attempts: 60, delayMs: 500 };

const [viteReady, apiReady] = await Promise.all([
  waitForHttpOk('http://127.0.0.1:5173/', waitOpts),
  waitForHttpOk('http://127.0.0.1:3847/api/health', waitOpts),
]);

console.log(
  `Boot check: Vite ${viteReady ? 'ready' : 'not ready'} on 127.0.0.1:5173; `
  + `API ${apiReady ? 'ready' : 'not ready'} on 127.0.0.1:3847`,
);

if (!viteReady || !apiReady) {
  console.log('Opening Jarvis windows anyway — they will retry until the local servers answer.');
}

const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const child = spawn(npmCmd, ['run', 'electron'], {
  cwd: root,
  stdio: 'inherit',
  shell: true,
  env: process.env,
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});

import { execFileSync, execSync } from 'child_process';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { listeningPidsFromNetstat } from '../src/utils/listeningPids.js';

const PORTS = [3847, 5173];
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const thisPid = process.pid;

function netstatText() {
  try {
    if (process.platform === 'win32') {
      return execFileSync('netstat', ['-ano'], { encoding: 'utf8' });
    }
    try {
      return execFileSync('ss', ['-tlnp'], { encoding: 'utf8' });
    } catch {
      return execFileSync('netstat', ['-tlnp'], { encoding: 'utf8' });
    }
  } catch {
    return '';
  }
}

function stopPid(pid) {
  if (!pid || pid === thisPid) return;
  try {
    if (process.platform === 'win32') {
      execFileSync('taskkill', ['/F', '/PID', String(pid)], { stdio: 'ignore' });
    } else {
      process.kill(pid, 'SIGTERM');
    }
  } catch {
    /* already gone */
  }
}

function stopStaleElectron() {
  const winExe = join(root, 'node_modules', 'electron', 'dist', 'electron.exe');
  const linuxBin = join(root, 'node_modules', 'electron', 'dist', 'electron');
  const marker = process.platform === 'win32' ? winExe : linuxBin;
  if (!existsSync(marker)) return;

  if (process.platform === 'win32') {
    const script = `Get-CimInstance Win32_Process -Filter "Name='electron.exe'" | ForEach-Object { if ($_.ExecutablePath -and $_.ExecutablePath -like '*node_modules\\\\electron\\\\dist\\\\electron.exe') { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue } }`;
    try {
      execFileSync('powershell', ['-NoProfile', '-Command', script], { stdio: 'ignore' });
    } catch {
      /* ignore */
    }
    return;
  }

  try {
    execSync(`ps -eo pid=,args= | grep '${linuxBin}' | grep -v grep`, { encoding: 'utf8' })
      .split('\n')
      .map((line) => Number.parseInt(line.trim(), 10))
      .filter((pid) => Number.isInteger(pid) && pid > 0 && pid !== thisPid)
      .forEach(stopPid);
  } catch {
    /* no matching electron */
  }
}

const pids = listeningPidsFromNetstat(netstatText(), PORTS);
for (const pid of pids) stopPid(pid);
stopStaleElectron();

if (pids.length) {
  console.log(`Freed Jarvis ports ${PORTS.join(', ')} (stopped PIDs ${pids.join(', ')})`);
}

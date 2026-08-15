const DEFAULT_PORTS = [3847, 5173];

function portPattern(port) {
  return new RegExp(`[:\\[]${Number(port)}(?:\\]|\\s|$)`);
}

export function listeningPidsFromNetstat(text, ports = DEFAULT_PORTS) {
  const wanted = [...new Set(ports.map(Number).filter((port) => Number.isInteger(port) && port > 0))];
  const pids = new Set();

  for (const line of String(text || '').split(/\r?\n/)) {
    if (!/LISTEN/i.test(line)) continue;
    const matched = wanted.some((port) => portPattern(port).test(line));
    if (!matched) continue;
    const last = line.trim().split(/\s+/).pop();
    const pid = Number.parseInt(last, 10);
    if (Number.isInteger(pid) && pid > 0) pids.add(pid);
  }

  return [...pids];
}

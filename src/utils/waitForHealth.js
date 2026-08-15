export async function waitForHttpOk(url, { attempts = 40, delayMs = 500, signal } = {}) {
  for (let i = 0; i < attempts; i++) {
    if (signal?.aborted) return false;
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {
      /* not listening yet */
    }
    if (i < attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return false;
}

export async function waitForHealth(server, { attempts = 40, delayMs = 500, signal } = {}) {
  for (let i = 0; i < attempts; i++) {
    if (signal?.aborted) return null;
    try {
      const res = await fetch(`${server}/api/health`);
      if (res.ok) return await res.json();
    } catch {
      /* server not listening yet */
    }
    if (i < attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return null;
}

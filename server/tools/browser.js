import { exec } from 'child_process';
import { promisify } from 'util';
import { broadcast } from '../events.js';

const execAsync = promisify(exec);

export async function openUrl({ url }) {
  const platform = process.platform;
  try {
    if (platform === 'win32') {
      await execAsync(`start "" "${url}"`, { shell: 'cmd.exe' });
    } else if (platform === 'darwin') {
      await execAsync(`open "${url}"`);
    } else {
      await execAsync(`xdg-open "${url}"`);
    }
    broadcast({
      type: 'artifact',
      data: { type: 'text', title: 'Opened URL', content: url },
    });
    return { opened: url };
  } catch (err) {
    return { error: err.message };
  }
}

export async function googleSearch({ query }) {
  const url = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
  const result = await openUrl({ url });
  broadcast({
    type: 'artifact',
    data: {
      type: 'web_results',
      title: `Google: ${query}`,
      content: JSON.stringify([{ title: query, url, snippet: 'Opened in your default browser.' }]),
    },
  });
  return { ...result, query, url };
}

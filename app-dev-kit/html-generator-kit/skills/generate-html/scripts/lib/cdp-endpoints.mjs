import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const PORT_FILES = [
  'Library/Application Support/Google/Chrome/DevToolsActivePort',
  'Library/Application Support/Chromium/DevToolsActivePort',
];

// Already-open Chrome, in the order we try them. A new launch is not in this list.
export function cdpEndpoints({
  env = process.env,
  home = homedir(),
  exists = existsSync,
  readFile = readFileSync,
} = {}) {
  const urls = [];
  if (env.VERIFY_CDP_URL) urls.push(String(env.VERIFY_CDP_URL).replace(/\/$/, ''));
  for (const rel of PORT_FILES) {
    const file = join(home, rel);
    try {
      if (!exists(file)) continue;
      const port = String(readFile(file, 'utf8')).split('\n')[0].trim();
      if (/^\d+$/.test(port)) urls.push(`http://127.0.0.1:${port}`);
    } catch { /* unreadable port file — try the next candidate */ }
  }
  urls.push('http://127.0.0.1:9222');
  return [...new Set(urls)];
}

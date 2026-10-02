import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { cdpEndpoints } from './lib/cdp-endpoints.mjs';

const script = new URL('./verify-prototype.mjs', import.meta.url);

test('DevToolsActivePort is tried before port 9222, and neither is a new launch', () => {
  const home = '/tmp/fake-home';
  const portFile = join(home, 'Library/Application Support/Google/Chrome/DevToolsActivePort');
  const urls = cdpEndpoints({
    env: { VERIFY_CDP_URL: 'http://127.0.0.1:9333/' },
    home,
    exists: (p) => p === portFile,
    readFile: () => '9444\n/devtools/browser/abc\n',
  });
  assert.deepEqual(urls, ['http://127.0.0.1:9333', 'http://127.0.0.1:9444', 'http://127.0.0.1:9222']);
});

function page(title, shellExtra = '', href = './home.html') {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body>
  <div class="app">
    <aside class="sidebar">
      <a class="sidebar-brand" href="../index.html">App</a>
      <nav class="sidebar-nav">
        <a class="nav-item" data-nav-id="home" href="${href}">Home</a>
        <a class="nav-item" data-nav-id="list" href="./list.html">List</a>
      </nav>
      ${shellExtra}
    </aside>
    <main><div class="page-header"><h1 class="page-title">${title}</h1></div></main>
  </div>
</body>
</html>`;
}

function run(dir) {
  return spawnSync(process.execPath, [script.pathname, dir, '--port', '0'], {
    env: { ...process.env, VERIFY_SKIP_BROWSER: '1' },
    encoding: 'utf8',
  });
}

test('shared sidebar mismatch is a critical; page title and href shape are not', () => {
  const dir = mkdtempSync(join(tmpdir(), 'html-verify-'));
  try {
    mkdirSync(join(dir, 'pages'));
    writeFileSync(join(dir, 'pages', 'home.html'), page('Home'));
    writeFileSync(join(dir, 'pages', 'list.html'), page('Members', '<button class="btn-ghost">Alerts</button>'));
    writeFileSync(join(dir, 'index.html'), page('Map', '', 'pages/home.html'));
    const bad = run(dir);
    assert.equal(bad.status, 1);
    assert.match(bad.stdout, /pages\/list\.html: shared sidebar differs from pages\/home\.html/);

    writeFileSync(join(dir, 'pages', 'list.html'), page('Members'));
    const good = run(dir);
    assert.equal(good.status, 0, good.stdout);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// Shared chrome: aside.sidebar or header.topnav. The in-page .page-header is not part of this.

function sliceElement(html, start, tag) {
  const openRe = new RegExp(`<${tag}\\b[^>]*>`, 'gi');
  const closeRe = new RegExp(`</${tag}\\s*>`, 'gi');
  openRe.lastIndex = start;
  if (!openRe.exec(html)) return '';
  let depth = 1;
  let i = openRe.lastIndex;
  while (depth > 0 && i < html.length) {
    openRe.lastIndex = i;
    closeRe.lastIndex = i;
    const nextOpen = openRe.exec(html);
    const nextClose = closeRe.exec(html);
    if (!nextClose) return html.slice(start);
    if (nextOpen && nextOpen.index < nextClose.index) {
      depth += 1;
      i = openRe.lastIndex;
    } else {
      depth -= 1;
      i = closeRe.lastIndex;
    }
  }
  return html.slice(start, i);
}

export function shellOf(html) {
  const re = /<(aside|header)\b([^>]*)>/gi;
  let m;
  while ((m = re.exec(html))) {
    const cls = m[2].match(/class\s*=\s*["']([^"']*)["']/i);
    if (!cls) continue;
    const classes = cls[1].split(/\s+/);
    const tag = m[1].toLowerCase();
    const kind = tag === 'aside' && classes.includes('sidebar') ? 'sidebar'
      : tag === 'header' && classes.includes('topnav') ? 'topnav'
        : null;
    if (!kind) continue;
    return { kind, html: sliceElement(html, m.index, tag) };
  }
  return null;
}

export function normalizeShell(html) {
  let s = html.replace(/<a\b[^>]*>/gi, (tag) => {
    const id = tag.match(/\bdata-nav-id="([^"]*)"/);
    if (!id) return tag;
    return tag.replace(/\bhref="[^"]*"/, `href="#${id[1]}"`);
  });
  s = s.replace(/\b(href|src)="(?:\.\.\/|\.\/|pages\/)+/g, '$1="');
  s = s.replace(/\bnav-item-active\b/g, '').replace(/\s*aria-current="page"/g, '');
  return s.replace(/\s+/g, ' ').replace(/"\s+/g, '"').replace(/\s+"/g, '"').trim();
}

// files: [{ rel, html }]. Shell-less pages (login) are exempt.
export function shellMismatches(files) {
  const screens = [];
  for (const f of files) {
    if (!f.rel.startsWith('pages/')) continue;
    const shell = shellOf(f.html);
    if (shell) screens.push({ rel: f.rel, shell });
  }
  if (screens.length === 0) return [];

  const issues = [];
  const counts = new Map();
  for (const s of screens) counts.set(s.shell.kind, (counts.get(s.shell.kind) || 0) + 1);
  const majority = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  if (counts.size > 1) {
    for (const s of screens) {
      if (s.shell.kind !== majority) issues.push(`${s.rel}: shell is ${s.shell.kind}; other pages use ${majority}`);
    }
    return issues;
  }

  const comparable = screens.filter((s) => s.shell.kind === majority);
  const index = files.find((f) => f.rel === 'index.html');
  const indexShell = index ? shellOf(index.html) : null;
  if (indexShell && indexShell.kind === majority) comparable.push({ rel: index.rel, shell: indexShell });

  if (comparable.length < 2) return issues;
  const baseline = comparable[0];
  const norm = normalizeShell(baseline.shell.html);
  for (const s of comparable) {
    if (s === baseline) continue;
    if (normalizeShell(s.shell.html) !== norm) issues.push(`${s.rel}: shared ${s.shell.kind} differs from ${baseline.rel}`);
  }
  return issues;
}

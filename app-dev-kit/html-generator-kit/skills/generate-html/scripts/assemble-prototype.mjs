#!/usr/bin/env node
// Station 5: write index.html and js/navigation.js from the page list.
// index.html reuses the sidebar/topnav of a generated page (links rewritten for the root), so a
// provided layout and the shared-shell check hold by construction; the template sidebar is the
// fallback when no page has a shell.
// Usage: node assemble-prototype.mjs <OUTPUT_DIR> --pages <spec-summary.json | delta-pages.json> --title <title> [--kit <KIT_DIR>]
// Exit 0 ok, 1 a listed page has no file, 2 usage error.

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { shellOf } from './lib/shell-consistency.mjs'

const args = process.argv.slice(2)
const opt = (name) => (args.indexOf(`--${name}`) >= 0 ? args[args.indexOf(`--${name}`) + 1] : '')
const optValues = new Set(['pages', 'title', 'kit'].map(opt))
const out = args.find((a) => !a.startsWith('--') && !optValues.has(a))
const pagesPath = opt('pages')
const title = opt('title') || 'Prototype'
const kit = opt('kit') || join(dirname(fileURLToPath(import.meta.url)), '../../..')
if (!out || !pagesPath || !existsSync(pagesPath)) {
  console.error('usage: assemble-prototype.mjs <OUTPUT_DIR> --pages <spec-summary.json | delta-pages.json> --title <title>')
  process.exit(2)
}

const summary = JSON.parse(readFileSync(pagesPath, 'utf8'))
const pages = [...(summary.assembly_pages ?? [])]
const files = existsSync(join(out, 'pages')) ? readdirSync(join(out, 'pages')).filter((f) => f.endsWith('.html')).sort() : []
const missing = pages.filter((p) => !files.includes(`${p.id}.html`)).map((p) => p.id)
if (missing.length) {
  console.log(JSON.stringify({ status: 'failed', missing_pages: missing }))
  process.exit(1)
}
for (const f of files) {
  const id = f.replace(/\.html$/, '')
  if (!pages.some((p) => p.id === id)) pages.push({ id, title: id, domain: '', description: '' })
}
const groups = {}
for (const p of pages) (groups[p.domain] ??= []).push(p.id)

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const ICONS = [[/profile|resident|user|member|people|team/, '👥'], [/document|file|register/, '📄'], [/client|bank|account/, '🏦'], [/analytic|report|metric/, '📊'], [/setting|config/, '⚙️'], [/dashboard|home|overview/, '🏠'], [/note|request|message/, '📝'], [/listing|catalog|item|product/, '📦']]
const icon = (p) => ICONS.find(([re]) => re.test(`${p.domain} ${p.id}`))?.[1] ?? '•'
const label = (domain) => domain.split('-').filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ')

const navJsTpl = readFileSync(join(kit, 'skills/generate-html/templates/navigation-js.md'), 'utf8').match(/```javascript\n([\s\S]*?)\n```/)[1]
const navJs = navJsTpl
  .replace(/const PAGES = \[[\s\S]*?\n\]/, `const PAGES = [\n${pages.map((p) => `  { id: ${JSON.stringify(p.id)}, title: ${JSON.stringify(p.title)}, domain: ${JSON.stringify(p.domain)} },`).join('\n')}\n]`)
  .replace(/const NAV_GROUPS = \{[\s\S]*?\n\}/, `const NAV_GROUPS = {\n${Object.entries(groups).map(([d, ids]) => `  ${JSON.stringify(d)}: ${JSON.stringify(ids)},`).join('\n')}\n}`)
writeFileSync(join(out, 'js/navigation.js'), `${navJs}\n`)

let index = readFileSync(join(kit, 'skills/generate-html/templates/index-shell.md'), 'utf8').match(/```html\n([\s\S]*?)\n```/)[1]
const navItems = Object.entries(groups).map(([domain, ids]) => [
  '        <div class="nav-group">',
  domain ? `          <p class="nav-group-label">${esc(label(domain))}</p>` : '',
  ...ids.map((id) => pages.find((p) => p.id === id)).map((p) => `          <a href="pages/${p.id}.html" class="nav-item" data-nav-id="${p.id}">${icon(p)} ${esc(p.title)}</a>`),
  '        </div>',
].filter(Boolean).join('\n')).join('\n')
const cards = pages.map((p) => [
  `          <a href="pages/${p.id}.html" class="card card-link hover-lift">`,
  '            <div class="card-header">',
  `              <span class="font-semibold">${icon(p)} ${esc(p.title)}</span>`,
  p.domain ? `              <span class="badge badge-default">${esc(label(p.domain))}</span>` : '',
  '            </div>',
  `            <p class="card-content text-sm text-muted">${esc(p.description)}</p>`,
  '          </a>',
].filter(Boolean).join('\n')).join('\n')
index = index
  .replace(/<!--\s*NAV_ITEMS_BLOCK[\s\S]*?-->/, navItems.trim())
  .replace(/<!--\s*PAGE_CARDS_BLOCK[\s\S]*?-->/, cards.trim())
  .replaceAll('APP_TITLE', esc(title))
  .replaceAll('PAGE_COUNT', String(pages.length))

let borrowed = ''
for (const f of files) {
  const html = readFileSync(join(out, 'pages', f), 'utf8')
  const shell = shellOf(html)
  if (!shell) continue
  const toRoot = (s) => s
    .replace(/(href|src)="\.\.\/([^"]*)"/g, '$1="$2"')
    .replace(/(href|src)="\.\/([^"]*)"/g, '$1="pages/$2"')
    .replace(/href="(?![a-z]+:|#|\/|pages\/|index\.html)([^"]+\.html[^"]*)"/gi, 'href="pages/$1"')
  index = index.replace(/<aside class="sidebar">[\s\S]*?<\/aside>/, toRoot(shell.html))
  const appOpen = html.match(/<div class="app[^"]*"[^>]*>/)?.[0]
  if (appOpen) index = index.replace('<div class="app">', appOpen)
  borrowed = f
  break
}
writeFileSync(join(out, 'index.html'), `${index}\n`)
console.log(JSON.stringify({ status: 'wired', files: ['index.html', 'js/navigation.js'], pages_wired: pages.length, shell_from: borrowed || 'template' }))

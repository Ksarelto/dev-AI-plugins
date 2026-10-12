#!/usr/bin/env node
// Copy a prototype's light :root tokens into shared/ui/theme/globals.css.
// Skips .dark. Merges every extra :root block in globals.css into the first one.
// Second run writes nothing new.
//
//   node port-prototype-theme.mjs --prototype <dir> --globals <globals.css>
//   node port-prototype-theme.mjs --check --prototype <dir> --globals <globals.css>
//     diff :root tokens; print each missing or mismatched token or a duplicate :root; exit 1. Does not write.

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const args = process.argv.slice(2)
const flag = (name) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] ?? '' : ''
}
const proto = flag('prototype')
const globalsPath = flag('globals')
const check = args.includes('--check')
if (!proto || !globalsPath) {
  console.error('usage: port-prototype-theme.mjs [--check] --prototype <dir> --globals <globals.css>')
  process.exit(2)
}
const tokensPath = join(proto, 'css/tokens.css')
if (!existsSync(tokensPath)) {
  console.error(`no ${tokensPath}`)
  process.exit(1)
}

function blockAt(css, start) {
  const open = css.indexOf('{', start)
  let depth = 0
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++
    else if (css[i] === '}') {
      depth--
      if (depth === 0) return { start, bodyStart: open + 1, bodyEnd: i, end: i + 1 }
    }
  }
  return null
}

function block(css, re) {
  const m = re.exec(css)
  return m ? blockAt(css, m.index) : null
}

function roots(css) {
  return [...css.matchAll(/(?:^|[^\w.-])(:root\s*\{)/g)]
    .map((m) => blockAt(css, m.index + m[0].length - m[1].length))
    .filter(Boolean)
}

function statements(body) {
  return body
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const i = s.indexOf(':')
      const name = s.slice(0, i).trim()
      if (i <= 0 || !/^[\w-]+$/.test(name)) return null
      return [name, s.slice(i + 1).trim().replace(/\s+/g, ' ')]
    })
}

function decls(body) {
  const out = []
  for (const line of body.split('\n')) {
    const m = line.match(/^\s*(--[\w-]+)\s*:\s*(.+?)\s*;\s*$/)
    if (m) out.push([m[1], m[2]])
  }
  return out
}

// Formatter-neutral form for --check: Prettier rewrites 0.10 → 0.1, .5 → 0.5, 'Inter' → "Inter",
// and spacing after commas; none of those change the token.
function sameValue(a, b) {
  const norm = (v) => v
    .replace(/#[0-9a-f]{3,8}\b|(-?\d*\.\d+|-?\d+)/gi, (m, num) => (num === undefined ? m.toLowerCase() : String(Number(num))))
    .replace(/'/g, '"')
    .replace(/\s*([,()/])\s*/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
  return norm(a) === norm(b)
}

function hasDecl(body, name) {
  return new RegExp(`(^|\\n)\\s*${name}(?![-\\w])\\s*:`).test(body)
}

function upsert(body, name, value) {
  const re = new RegExp(`((?:^|\\n)[ \\t]*)${name}(?![-\\w])\\s*:[^;]*;`)
  if (re.test(body)) return body.replace(re, `$1${name}: ${value};`)
  return `${body.replace(/\s*$/, '')}\n  ${name}: ${value};\n`
}

const GENERIC = /^(system-ui|sans-serif|serif|monospace|ui-sans-serif|ui-serif|ui-monospace|-apple-system|segoe ui|blinkmacsystemfont)$/i
function families(value) {
  return [...value.matchAll(/'([^']+)'|"([^"]+)"/g)]
    .map((m) => m[1] || m[2])
    .filter((name) => !GENERIC.test(name))
}

const tokens = readFileSync(tokensPath, 'utf8')
const root = block(tokens, /(?:^|[^\w.-]):root\s*\{/)
if (!root) {
  console.error('tokens.css has no :root')
  process.exit(1)
}
const props = decls(tokens.slice(root.bodyStart, root.bodyEnd))
if (check) {
  const hostCss = existsSync(globalsPath) ? readFileSync(globalsPath, 'utf8') : ''
  const hostRoots = roots(hostCss)
  const hostRoot = hostRoots[0]
  const host = new Map(hostRoot ? decls(hostCss.slice(hostRoot.bodyStart, hostRoot.bodyEnd)) : [])
  const diffs = []
  if (hostRoots.length > 1) diffs.push(`DUPLICATE :root: globals has ${hostRoots.length} blocks; re-run the port to merge them, do not delete one by hand`)
  for (const [name, value] of props) {
    if (!host.has(name)) diffs.push(`MISSING ${name}`)
    else if (!sameValue(host.get(name), value)) diffs.push(`DIFF ${name}: globals ${host.get(name)} != prototype ${value}`)
  }
  if (diffs.length) {
    console.log(diffs.join('\n'))
    process.exit(1)
  }
  console.log('OK')
  process.exit(0)
}
let css = existsSync(globalsPath) ? readFileSync(globalsPath, 'utf8') : '@import "tailwindcss";\n'

let [host, ...extra] = roots(css)
if (!host) {
  css = `${css.trimEnd()}\n\n:root {\n}\n`
  host = roots(css)[0]
}
let body = css.slice(host.bodyStart, host.bodyEnd)
for (const r of extra) {
  for (const stmt of statements(css.slice(r.bodyStart, r.bodyEnd))) {
    if (!stmt) {
      console.error(`cannot merge the :root block at offset ${r.start} in ${globalsPath}: unparsable declaration. Merge it into the first :root by hand, then re-run.`)
      process.exit(1)
    }
    body = upsert(body, stmt[0], stmt[1])
  }
}
const current = new Map(decls(body))
for (const [name, value] of props) {
  if (!current.has(name) || !sameValue(current.get(name), value)) body = upsert(body, name, value)
}
for (const r of extra.reverse()) css = css.slice(0, r.start).replace(/\s*$/, '') + css.slice(r.end)
css = css.slice(0, host.bodyStart) + body + css.slice(host.bodyEnd)

const isColor = (value) => /oklch|rgba?\(|hsla?\(|#|color-mix/i.test(value)
const themeLines = []
for (const [name, value] of props) {
  if (name.startsWith('--shadow-')) themeLines.push([name, value])
  else if (isColor(value)) themeLines.push([`--color-${name.slice(2)}`, `var(${name})`])
}
let theme = block(css, /@theme\s+inline\s*\{/)
if (!theme && themeLines.length) {
  const at = css.search(/(?:^|[^\w.-]):root\s*\{/)
  const insert = `@theme inline {\n${themeLines.map(([k, v]) => `  ${k}: ${v};`).join('\n')}\n}\n\n`
  css = `${css.slice(0, at)}${insert}${css.slice(at)}`
} else if (theme) {
  let themeBody = css.slice(theme.bodyStart, theme.bodyEnd)
  for (const [name, value] of themeLines) {
    if (!hasDecl(themeBody, name)) themeBody = upsert(themeBody, name, value)
  }
  css = css.slice(0, theme.bodyStart) + themeBody + css.slice(theme.bodyEnd)
}

const fonts = [...new Set(props.flatMap(([name, value]) => (name === '--font-sans' || name === '--font-display' ? families(value) : [])))]
if (fonts.length) {
  const query = fonts.map((f) => `family=${f.replace(/ /g, '+')}:wght@400;500;600;700`).join('&')
  const line = `@import url("https://fonts.googleapis.com/css2?${query}&display=swap");`
  const imports = css.split('\n').filter((l) => l.includes('@import'))
  const covered = fonts.every((f) => imports.some((l) => l.includes(f) || l.includes(f.replace(/ /g, '+'))))
  if (!covered) {
    const last = css.lastIndexOf('@import')
    const eol = last >= 0 ? css.indexOf('\n', last) : -1
    css = eol >= 0 ? `${css.slice(0, eol + 1)}${line}\n${css.slice(eol + 1)}` : `${line}\n${css}`
  }
}

const before = existsSync(globalsPath) ? readFileSync(globalsPath, 'utf8') : ''
if (css !== before) writeFileSync(globalsPath, css)
console.log(css === before ? 'UNCHANGED' : `OK: ${globalsPath}`)

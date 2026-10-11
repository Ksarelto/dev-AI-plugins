#!/usr/bin/env node
// Copy a prototype's light :root tokens into shared/ui/theme/globals.css.
// Skips .dark. Second run writes nothing new.
//
//   node port-prototype-theme.mjs --prototype <dir> --globals <globals.css>
//   node port-prototype-theme.mjs --check --prototype <dir> --globals <globals.css>
//     diff :root tokens; print each missing or mismatched token; exit 1. Does not write.

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

function block(css, re) {
  const m = re.exec(css)
  if (!m) return null
  const open = css.indexOf('{', m.index)
  let depth = 0
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++
    else if (css[i] === '}') {
      depth--
      if (depth === 0) return { start: m.index, bodyStart: open + 1, bodyEnd: i, end: i + 1 }
    }
  }
  return null
}

function decls(body) {
  const out = []
  for (const line of body.split('\n')) {
    const m = line.match(/^\s*(--[\w-]+)\s*:\s*(.+?)\s*;\s*$/)
    if (m) out.push([m[1], m[2]])
  }
  return out
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
  const hostRoot = hostCss ? block(hostCss, /(?:^|[^\w.-]):root\s*\{/) : null
  const host = new Map(hostRoot ? decls(hostCss.slice(hostRoot.bodyStart, hostRoot.bodyEnd)) : [])
  const diffs = []
  for (const [name, value] of props) {
    if (!host.has(name)) diffs.push(`MISSING ${name}`)
    else if (host.get(name) !== value) diffs.push(`DIFF ${name}: globals ${host.get(name)} != prototype ${value}`)
  }
  if (diffs.length) {
    console.log(diffs.join('\n'))
    process.exit(1)
  }
  console.log('OK')
  process.exit(0)
}
let css = existsSync(globalsPath) ? readFileSync(globalsPath, 'utf8') : '@import "tailwindcss";\n'

let host = block(css, /(?:^|[^\w.-]):root\s*\{/)
if (!host) {
  css = `${css.trimEnd()}\n\n:root {\n}\n`
  host = block(css, /(?:^|[^\w.-]):root\s*\{/)
}
let body = css.slice(host.bodyStart, host.bodyEnd)
for (const [name, value] of props) body = upsert(body, name, value)
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

#!/usr/bin/env node
// Prototype inventory: html-generator-kit page(s) → the parity table the React build must satisfy.
// Every visible string, control, field, column, badge, dialog, toast, and view state becomes one row.
// Station 6 fills `React target` + `Status`; `--check` fails blank, `missing`, or reasonless `n/a` rows
// and any prototype state (loading / empty / error / success) with no `done` row.
// Usage:
//   node extract-prototype-inventory.mjs --spec <.spec/features/<slug>.md> [--out <inventory.md>]
//   node extract-prototype-inventory.mjs --page <page.html> [--page <page.html>] --out <inventory.md>
//   node extract-prototype-inventory.mjs --check <inventory.md>
// Re-extracting keeps React target / Status for rows whose page, region, kind, and text are unchanged.
// Exit 0 = wrote / nothing to extract / check passed. Exit 1 = check failed. Exit 2 = usage or read failure.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join, basename, resolve } from 'node:path'

const args = process.argv.slice(2)
function flag(name) {
  const i = args.indexOf(`--${name}`)
  if (i < 0) return undefined
  const next = args[i + 1]
  if (!next || next.startsWith('--')) return true
  return next
}
function flags(name) {
  const out = []
  args.forEach((a, i) => {
    if (a === `--${name}` && args[i + 1] && !args[i + 1].startsWith('--')) out.push(args[i + 1])
  })
  return out
}
function die(msg) {
  console.error(`FATAL: ${msg}`)
  process.exit(2)
}

const CANONICAL_STATES = ['loading', 'empty', 'error', 'success']
const COLUMNS = ['#', 'Region/state', 'Kind', 'Prototype text', 'Hint', 'React target', 'Status']

// ---------- HTML → tree (dependency-free; the generator emits well-formed markup) ----------

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'])
const RAW = new Set(['script', 'style'])
const INLINE = new Set(['span', 'strong', 'em', 'b', 'i', 'small', 'code', 'abbr', 'time', 'br', 'svg'])
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', middot: '·', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', times: '×', copy: '©' }

function decode(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10))
    return ENTITIES[e.toLowerCase()] ?? m
  })
}

function parseAttrs(src) {
  const attrs = {}
  const re = /([^\s=/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g
  let m
  while ((m = re.exec(src))) attrs[m[1]] = decode(m[2] ?? m[3] ?? m[4] ?? '')
  return attrs
}

function parseHtml(html) {
  const root = { tag: '#root', attrs: {}, children: [], parent: null }
  let cur = root
  const re = /<!--[\s\S]*?-->|<![^>]*>|<\/([a-zA-Z][\w-]*)\s*>|<([a-zA-Z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>|([^<]+)|</g
  let m
  while ((m = re.exec(html))) {
    if (m[1]) {
      const tag = m[1].toLowerCase()
      let n = cur
      while (n && n.tag !== tag) n = n.parent
      if (n && n.parent) cur = n.parent
    } else if (m[2]) {
      const tag = m[2].toLowerCase()
      const el = { tag, attrs: parseAttrs(m[3]), children: [], parent: cur }
      cur.children.push(el)
      if (RAW.has(tag)) {
        const end = html.indexOf(`</${tag}`, re.lastIndex)
        re.lastIndex = end < 0 ? html.length : end
      } else if (!VOID.has(tag) && !m[4]) {
        cur = el
      }
    } else if (m[5] !== undefined) {
      cur.children.push({ text: m[5], parent: cur })
    }
  }
  return root
}

const isEl = (n) => n && n.text === undefined
const classes = (el) => (el.attrs.class ?? '').split(/\s+/).filter(Boolean)
const hasClass = (el, re) => classes(el).some((c) => re.test(c))
const classMatch = (el, re) => {
  for (const c of classes(el)) {
    const m = c.match(re)
    if (m) return m[1]
  }
  return ''
}
function findFirst(node, pred) {
  if (!isEl(node)) return null
  if (pred(node)) return node
  for (const c of node.children) {
    const hit = findFirst(c, pred)
    if (hit) return hit
  }
  return null
}
function findAll(node, pred, out = []) {
  if (!isEl(node)) return out
  if (pred(node)) out.push(node)
  for (const c of node.children) findAll(c, pred, out)
  return out
}
function hasAncestor(el, pred) {
  for (let n = el.parent; n; n = n.parent) if (pred(n)) return true
  return false
}

const clean = (s) => s.replace(/\s+/g, ' ').trim()
const clip = (s, n = 60) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)
const isSkipped = (el) => RAW.has(el.tag) || hasClass(el, /^dev-panel$/) || el.attrs['aria-hidden'] === 'true'
const hasCopy = (s) => /[\p{L}\p{N}]/u.test(s)
const isEmojiOnly = (s) => s !== '' && /^[\p{Extended_Pictographic}\p{Emoji_Component}\s\uFE0F\u200D]+$/u.test(s) && !/[A-Za-z0-9]/.test(s)

function textOf(node) {
  if (!isEl(node)) return decode(node.text)
  if (isSkipped(node) || node.tag === 'template' && node.attrs['x-for'] !== undefined) return ''
  if (node.attrs['x-text'] !== undefined || node.attrs['x-html'] !== undefined) return ' {…} '
  if (['input', 'select', 'textarea'].includes(node.tag)) return ''
  return node.children.map(textOf).join('')
}

function literalsOf(expr) {
  const out = []
  const re = /'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g
  let m
  while ((m = re.exec(expr))) {
    const s = clean((m[1] ?? m[2] ?? m[3] ?? '').replace(/\\(.)/g, '$1').replace(/\$\{[^}]*\}/g, '{…}'))
    if (!/[a-z]/i.test(s)) continue
    if (/^[A-Z0-9_]+$/.test(s)) continue
    if (/^[a-z][\w-]*$/.test(s) && !/\s/.test(s) && /-|[A-Z]/.test(s)) continue
    out.push(s)
  }
  return out
}

function describeBinding(expr) {
  const pairs = [...expr.matchAll(/([A-Z][A-Z0-9_]*)\s*:\s*'((?:[^'\\]|\\.)*)'/g)]
  if (pairs.length >= 2) {
    return { kind: 'enum-labels', text: pairs.map(([, k, v]) => `${k} → ${v}`).join('; '), hint: 'enum → label map; one locale key per value' }
  }
  const lits = literalsOf(expr)
  return { kind: 'bound', text: lits.join(' \\| '), hint: `bound: ${clip(clean(expr), 50)}` }
}

function stateOf(expr) {
  const e = expr.replace(/\s+/g, '')
  if (/(^|[^!\w.$])loading\b/.test(e) && !/!loading/.test(e)) return 'loading'
  if (/!loading&&!?\(?\w*error/.test(e) && !/!error/.test(e)) return 'error'
  if (/(^|[^!\w.])error\b/.test(e) && !/!error/.test(e) && !/\berrors\./.test(e)) return 'error'
  if (/\.length(===|==)0|!\w+(\??\.\w+)*\.length\b|\bempty\b/i.test(e)) return 'empty'
  if (/!loading/.test(e) && /!error/.test(e)) return 'success'
  return `when ${clip(clean(expr), 40)}`
}

function ifRegion(expr) {
  const modal = expr.match(/modal\.isOpen\(\s*['"]([^'"]+)['"]\s*\)/)
  if (modal) return `dialog:${modal[1]}`
  return `when ${clip(clean(expr), 40)}`
}

const joinRegion = (region, next) => (region === 'page' ? next : `${region} › ${next}`)

const BUTTON_VARIANT = { primary: 'default', default: 'default', secondary: 'secondary', ghost: 'ghost', destructive: 'destructive', danger: 'destructive', outline: 'outline', link: 'link' }

function eventAttrs(el) {
  return Object.entries(el.attrs).filter(([k]) => k.startsWith('@') || k.startsWith('x-on:'))
}

// ---------- page → rows ----------

function extractPage(html) {
  const root = parseHtml(html)
  const main = findFirst(root, (el) => el.tag === 'main') ?? findFirst(root, (el) => el.tag === 'body') ?? root
  const labelFor = new Map()
  for (const label of findAll(main, (el) => el.tag === 'label' && el.attrs.for)) {
    labelFor.set(label.attrs.for, clean(textOf(label)))
  }
  const byId = new Map(findAll(main, (el) => Boolean(el.attrs.id)).map((el) => [el.attrs.id, el]))

  const rows = []
  const seen = new Set()
  const skeletonRegions = new Set()
  const push = (region, kind, text, hint = '') => {
    const row = { region, kind, text: clean(text), hint: clean(hint) }
    const key = `${row.region}|${row.kind}|${row.text}|${row.hint}`
    if (seen.has(key)) return
    seen.add(key)
    rows.push(row)
  }

  function copyOf(el) {
    const bind = el.attrs['x-text'] ?? el.attrs['x-html']
    if (bind !== undefined) return describeBinding(bind)
    return { kind: '', text: clean(textOf(el)), hint: '' }
  }

  function eventRows(el, region) {
    for (const [name, value] of eventAttrs(el)) {
      for (const m of value.matchAll(/notification\.(success|error|info|warning|show)\(\s*(['"`])((?:(?!\2)[^\\]|\\.)*)\2/g)) {
        push(region, 'toast', m[3], `notify.${m[1]}`)
      }
      for (const m of value.matchAll(/errors\.(\w+)\s*=([^;]*)/g)) {
        for (const lit of literalsOf(m[2])) push(region, 'validation', lit, `field ${m[1]} (${name})`)
      }
    }
  }

  function buttonHint(el) {
    const parts = []
    const variant = classMatch(el, /^btn-(primary|default|secondary|ghost|destructive|danger|outline|link)$/)
    if (hasClass(el, /^chip$/)) parts.push('chip toggle → ToggleGroup item')
    else parts.push(`variant ${BUTTON_VARIANT[variant] ?? 'default'}`)
    const size = classMatch(el, /^btn-(sm|lg|icon)$/)
    if (size) parts.push(`size ${size}`)
    if (el.attrs.type === 'submit') parts.push('submit')
    if (el.tag === 'a' && el.attrs.href) parts.push(`→ ${basename(el.attrs.href).replace(/\.html$/, '')}`)
    for (const [, value] of eventAttrs(el)) {
      const open = value.match(/modal\.open\(\s*['"]([^'"]+)['"]/)
      if (open) parts.push(`opens dialog:${open[1]}`)
      if (/modal\.close\(/.test(value)) parts.push('closes dialog')
    }
    if (el.attrs['aria-label']) parts.push(`aria-label "${el.attrs['aria-label']}"`)
    return parts.join(', ')
  }

  function fieldLabel(el) {
    if (el.attrs.id && labelFor.has(el.attrs.id)) return labelFor.get(el.attrs.id)
    let n = el.parent
    while (n && n.tag !== 'label') n = n.parent
    if (n) return clean(textOf(n))
    if (el.attrs['aria-labelledby'] && byId.has(el.attrs['aria-labelledby'])) return clean(textOf(byId.get(el.attrs['aria-labelledby'])))
    return el.attrs['aria-label'] ?? ''
  }

  function field(el, region) {
    const parts = [el.tag === 'input' ? `input ${el.attrs.type ?? 'text'}` : el.tag]
    if (el.attrs.name ?? el.attrs['x-model']) parts.push(`name ${el.attrs.name ?? el.attrs['x-model']}`)
    if ('required' in el.attrs) parts.push('required')
    if (el.attrs.placeholder) parts.push(`placeholder "${el.attrs.placeholder}"`)
    push(region, 'field', fieldLabel(el), parts.join(', '))
    if (el.tag === 'select') {
      for (const opt of findAll(el, (o) => o.tag === 'option')) {
        const text = clean(textOf(opt))
        if (text) push(region, 'option', text, `value ${opt.attrs.value ?? text}`)
      }
    }
  }

  function table(el, region) {
    const bodyRows = findAll(el, (r) => (r.attrs.role === 'row' || r.tag === 'tr') && !findFirst(r, (c) => c.attrs.role === 'columnheader' || c.tag === 'th'))
    const repeat = findFirst(el, (t) => t.tag === 'template' && t.attrs['x-for'] !== undefined)
    const sampleBadges = [...new Set(bodyRows.flatMap((r) => findAll(r, (b) => hasClass(b, /^badge$/)).map((b) => clean(textOf(b)))).filter((t) => t && !t.includes('{…}')))]
    const hint = [
      repeat ? `x-for ${clip(clean(repeat.attrs['x-for']), 40)}` : `${bodyRows.length} sample rows — server data`,
      sampleBadges.length ? `row badges: ${sampleBadges.join(', ')}` : '',
    ].filter(Boolean).join('; ')
    push(region, 'table', el.attrs['aria-label'] ?? clean(textOf(findFirst(el, (c) => c.tag === 'caption') ?? { text: '' })), hint)
    const headers = findAll(el, (c) => c.attrs.role === 'columnheader' || c.tag === 'th')
    for (const h of headers) push(region, 'column', copyOf(h).text)
    for (const r of bodyRows) {
      for (const n of findAll(r, (c) => c.attrs['x-text'] !== undefined)) {
        const b = describeBinding(n.attrs['x-text'])
        if (b.kind === 'enum-labels' || b.text) push(region, b.kind, b.text, b.hint)
      }
      for (const n of findAll(r, (c) => c.tag === 'button' || (c.tag === 'a' && hasClass(c, /^btn(-|$)/)))) {
        push(region, 'button', copyOf(n).text || n.attrs['aria-label'] || '', buttonHint(n))
      }
    }
  }

  function walk(node, region, consumed) {
    if (!isEl(node)) {
      if (!consumed) {
        const t = clean(decode(node.text))
        if (hasCopy(t)) push(region, 'text', t)
      }
      return
    }
    const el = node
    if (isSkipped(el)) return
    let r = region
    if (el.attrs['x-show'] !== undefined) r = joinRegion(r, stateOf(el.attrs['x-show']))
    if (el.attrs['x-if'] !== undefined) r = joinRegion(r, ifRegion(el.attrs['x-if']))
    if (el.tag === 'template' && el.attrs['x-for'] !== undefined) {
      push(r, 'repeat', '', `x-for ${clip(clean(el.attrs['x-for']), 50)}`)
      r = joinRegion(r, 'each')
    }
    eventRows(el, r)
    const tag = el.tag
    const role = el.attrs.role

    if (/^h[1-6]$/.test(tag) || hasClass(el, /(^|-)title$/)) {
      const c = copyOf(el)
      push(r, c.kind === 'enum-labels' ? c.kind : 'heading', c.text, [tag, c.hint].filter(Boolean).join(', '))
      return walkChildren(el, r, true)
    }
    if (tag === 'button' || (tag === 'a' && hasClass(el, /^btn(-|$)/))) {
      const c = copyOf(el)
      const text = c.text && !isEmojiOnly(c.text) ? c.text : el.attrs['aria-label'] ?? el.attrs.title ?? ''
      push(r, 'button', text, [buttonHint(el), c.hint].filter(Boolean).join(', '))
      return
    }
    if (tag === 'a') {
      const to = el.attrs.href ? `→ ${basename(el.attrs.href).replace(/\.html$/, '')}` : ''
      if (el.children.some((c) => isEl(c) && !INLINE.has(c.tag))) {
        push(r, 'link', '', ['block link (card)', to].filter(Boolean).join(', '))
        return walkChildren(el, r, false)
      }
      const inCrumb = hasAncestor(el, (n) => hasClass(n, /breadcrumb/) || n.attrs['aria-label'] === 'Breadcrumb')
      push(r, inCrumb ? 'breadcrumb' : 'link', copyOf(el).text, to)
      return
    }
    if (tag === 'input' || tag === 'select' || tag === 'textarea') {
      if (el.attrs.type === 'hidden') return
      return field(el, r)
    }
    if (tag === 'label') return walkChildren(el, r, true)
    if (tag === 'table' || role === 'grid' || role === 'table' || hasClass(el, /^table$/)) return table(el, r)
    if (role === 'columnheader' || tag === 'th') {
      push(r, 'column', copyOf(el).text)
      return
    }
    if (hasClass(el, /^(badge|chip|tag)$/)) {
      const c = copyOf(el)
      push(r, c.kind === 'enum-labels' ? c.kind : 'badge', c.text, [classMatch(el, /^badge-(\w+)$/) && `variant ${classMatch(el, /^badge-(\w+)$/)}`, c.hint].filter(Boolean).join(', '))
      return
    }
    if (role === 'dialog' || role === 'alertdialog' || tag === 'dialog') {
      const titleEl = el.attrs['aria-labelledby'] ? byId.get(el.attrs['aria-labelledby']) : null
      const dr = r.includes('dialog:') ? r : joinRegion(r, 'dialog')
      push(dr, 'dialog', titleEl ? clean(textOf(titleEl)) : el.attrs['aria-label'] ?? '', role === 'alertdialog' ? 'alertdialog' : '')
      return walkChildren(el, dr, false)
    }
    if (role === 'tab') {
      push(r, 'tab', copyOf(el).text)
      return
    }
    if (hasClass(el, /^skeleton/)) {
      if (!skeletonRegions.has(r)) {
        skeletonRegions.add(r)
        push(r, 'skeleton', '', 'Skeleton placeholders')
      }
      return
    }
    if (hasClass(el, /^alert$/)) push(r, 'alert', '', [classMatch(el, /^alert-(\w+)$/) && `variant ${classMatch(el, /^alert-(\w+)$/)}`, role && `role ${role}`].filter(Boolean).join(', '))
    else if (role === 'status' && el.attrs['aria-label']) push(r, 'aria-label', el.attrs['aria-label'], 'role status')
    else if (el.attrs['aria-label'] && tag !== 'nav') push(r, 'aria-label', el.attrs['aria-label'], role ? `role ${role}` : tag)

    const own = clean(el.children.filter((c) => !isEl(c)).map((c) => decode(c.text)).join(' '))
    if (el.attrs['x-text'] !== undefined || el.attrs['x-html'] !== undefined) {
      const c = copyOf(el)
      push(r, c.kind, c.text, c.hint)
      return
    }
    if (isEmojiOnly(own) && el.children.every((c) => !isEl(c))) {
      if (!consumed) push(r, 'icon', own, 'decorative emoji → lucide icon, aria-hidden')
      return
    }
    if (hasCopy(own) && !consumed) {
      const inCrumb = hasAncestor(el, (n) => hasClass(n, /breadcrumb/) || n.attrs['aria-label'] === 'Breadcrumb')
      push(r, inCrumb ? 'breadcrumb' : 'text', textOf(el), inCrumb ? 'current page' : hasClass(el, /^divider$/) ? 'section divider' : '')
      return walkChildren(el, r, true)
    }
    walkChildren(el, r, consumed)
  }

  function walkChildren(el, region, consumed) {
    for (const c of el.children) walk(c, region, consumed)
  }

  walkChildren(main, 'page', false)
  const states = CANONICAL_STATES.filter((s) => rows.some((row) => topState(row.region) === s))
  return { rows, states }
}

function topState(region) {
  return region.split(' › ')[0]
}

// ---------- markdown in / out ----------

const esc = (s) => String(s).replace(/\|/g, '\\|').replace(/\\\\\|/g, '\\|')
const splitRow = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map((c) => c.trim())
const rowKey = (page, row) => [page, row.region, row.kind, row.text].join('\u0000')

function parseInventory(md) {
  const pages = []
  let page = null
  for (const line of md.split('\n')) {
    const h = line.match(/^## (\S+)(?: \((.+)\))?\s*$/)
    if (h) {
      page = { page: h[1], screenRef: h[2] ?? '', states: [], rows: [] }
      pages.push(page)
      continue
    }
    if (!page) continue
    const st = line.match(/^States in prototype:\s*(.*)$/)
    if (st) {
      page.states = st[1].split(',').map((s) => s.trim()).filter((s) => CANONICAL_STATES.includes(s))
      continue
    }
    if (!line.startsWith('|') || /^\|\s*-/.test(line) || /^\|\s*#\s*\|/.test(line)) continue
    const cells = splitRow(line)
    if (cells.length < COLUMNS.length) continue
    const [n, region, kind, text, hint, target, status] = cells
    page.rows.push({ n, region, kind, text: text.replace(/\\\|/g, '|'), hint, target, status })
  }
  return pages
}

function renderInventory(pages) {
  const out = [
    '# Prototype inventory',
    '',
    'Generated by `extract-prototype-inventory.mjs` from the html-generator-kit prototype. Do not edit',
    'the first five columns — re-run the script instead. Station 6 fills **React target** (the file that',
    'renders the row) and **Status**: `done`, `missing`, or `n/a: <reason>`. Copy rows are rendered with',
    '`t()` and the English value must match the Prototype text. `bound` rows render the named server',
    'field; their literals are fallbacks that still need a locale key. `enum-labels` rows are one key per',
    'value. Verify with `extract-prototype-inventory.mjs --check <this file>`.',
    '',
  ]
  for (const p of pages) {
    out.push(`## ${p.page}${p.screenRef ? ` (${p.screenRef})` : ''}`, '')
    out.push(`States in prototype: ${p.states.join(', ') || 'none'}`, '')
    out.push(`| ${COLUMNS.join(' | ')} |`, `|${COLUMNS.map(() => '---').join('|')}|`)
    p.rows.forEach((row, i) => {
      out.push(`| ${i + 1} | ${esc(row.region)} | ${row.kind} | ${esc(row.text)} | ${esc(row.hint)} | ${esc(row.target ?? '')} | ${esc(row.status ?? '')} |`)
    })
    out.push('')
  }
  return out.join('\n')
}

function check(path) {
  if (!existsSync(path)) die(`inventory not found: ${path}`)
  const pages = parseInventory(readFileSync(path, 'utf8'))
  if (!pages.length) die(`no page sections in ${path}`)
  const errors = []
  let total = 0
  let done = 0
  let na = 0
  for (const p of pages) {
    for (const row of p.rows) {
      total++
      const where = `${p.page} row ${row.n} (${row.kind} "${clip(row.text, 40)}")`
      const status = row.status.toLowerCase()
      if (!status) errors.push(`${where}: Status is blank`)
      else if (status === 'missing') errors.push(`${where}: missing in the React build`)
      else if (status === 'done') {
        done++
        if (!row.target) errors.push(`${where}: done without a React target`)
      } else if (/^n\/a\b/.test(status)) {
        na++
        if (!/^n\/a:\s*\S/.test(status)) errors.push(`${where}: n/a needs a reason (n/a: <reason>)`)
      } else errors.push(`${where}: Status must be done, missing, or n/a: <reason>`)
    }
    for (const s of p.states) {
      if (!p.rows.some((row) => topState(row.region) === s && row.status.toLowerCase() === 'done')) {
        errors.push(`${p.page}: prototype state "${s}" has no done row — the React page must render it`)
      }
    }
  }
  if (errors.length) {
    for (const e of errors) console.log(`ERROR ${e}`)
    console.log(`FAIL prototype parity: ${errors.length} error(s) across ${total} row(s)`)
    process.exit(1)
  }
  console.log(`OK prototype parity: ${total} row(s), ${done} done, ${na} n/a`)
  process.exit(0)
}

function readSpecPages(specPath) {
  if (!existsSync(specPath)) die(`spec not found: ${specPath}`)
  const md = readFileSync(specPath, 'utf8')
  const ref = md.match(/^prototype-ref:\s*(.+)$/m)?.[1]?.trim().replace(/^['"]|['"]$/g, '') ?? ''
  if (!ref || ref === 'none') return { protoDir: '', pages: [] }
  const pages = []
  let screenRef = ''
  for (const line of md.split('\n')) {
    const s = line.match(/^\s*-\s*screen-ref:\s*(\S+)/)
    if (s) screenRef = s[1]
    const p = line.match(/^\s*-\s*prototype-page:\s*(\S+)/)
    if (p && !pages.some((x) => x.page === p[1])) pages.push({ page: p[1], screenRef })
  }
  return { protoDir: ref, pages }
}

// ---------- main ----------

const checkPath = flag('check')
if (checkPath) {
  if (checkPath === true) die('--check needs an inventory path')
  check(checkPath)
}

const specPath = flag('spec')
const pageArgs = flags('page')
let outPath = flag('out')
if (outPath === true) die('--out needs a path')

let targets = []
if (specPath && specPath !== true) {
  const { protoDir, pages } = readSpecPages(specPath)
  targets = pages.map((p) => ({ label: p.page, screenRef: p.screenRef, file: resolve(protoDir, p.page) }))
  outPath ??= join(dirname(specPath), `${basename(specPath, '.md')}.context`, 'prototype-inventory.md')
} else if (pageArgs.length) {
  targets = pageArgs.map((f) => ({ label: basename(f), screenRef: '', file: resolve(f) }))
  if (!outPath) die('--page needs --out')
} else {
  die('usage: --spec <feature.md> | --page <page.html> --out <inventory.md> | --check <inventory.md>')
}

if (!targets.length) {
  console.log(`SKIP no prototype-page on ${specPath} — nothing to inventory`)
  process.exit(0)
}

const previous = new Map()
if (existsSync(outPath)) {
  for (const p of parseInventory(readFileSync(outPath, 'utf8'))) {
    for (const row of p.rows) previous.set(rowKey(p.page, row), row)
  }
}

const pages = targets.map((t) => {
  if (!existsSync(t.file)) die(`prototype page not found: ${t.file}`)
  const { rows, states } = extractPage(readFileSync(t.file, 'utf8'))
  for (const row of rows) {
    const prev = previous.get(rowKey(t.label, row))
    row.target = prev?.target ?? ''
    row.status = prev?.status ?? ''
  }
  return { page: t.label, screenRef: t.screenRef, states, rows }
})

mkdirSync(dirname(outPath), { recursive: true })
writeFileSync(outPath, renderInventory(pages))
const kept = pages.reduce((n, p) => n + p.rows.filter((r) => r.status).length, 0)
console.log(`WROTE ${outPath} — ${pages.map((p) => `${p.page}: ${p.rows.length} rows, states ${p.states.join('/') || 'none'}`).join('; ')}${kept ? ` (${kept} statuses kept)` : ''}`)

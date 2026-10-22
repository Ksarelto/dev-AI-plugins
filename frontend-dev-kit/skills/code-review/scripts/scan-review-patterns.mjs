#!/usr/bin/env node
// Every mechanical review hit, file and line. The review lists them all.
// Usage: node scan-review-patterns.mjs [--root <dir>] [--base <ref>] [--files a,b]
//        node scan-review-patterns.mjs --self-check
// Exit: 0 no hits · 1 hits · 2 usage.

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

const BUTTON_LOOK = /\b(bg|text|border|rounded|shadow|p|px|py|pt|pb|pl|pr|font)-/

const lineOf = (text, index) => text.slice(0, index).split('\n').length

const nestedIfs = (text) => {
  const hits = []
  const re = /\bif\s*\(/g
  for (const match of text.matchAll(re)) {
    const open = text.indexOf('{', match.index)
    if (open < 0) continue
    let depth = 0
    let quote = ''
    for (let i = open; i < text.length; i++) {
      const c = text[i]
      if (quote) {
        if (c === '\\') { i += 1; continue }
        if (c === quote) quote = ''
        continue
      }
      if (c === '"' || c === "'" || c === '`') { quote = c; continue }
      if (c === '{') depth += 1
      else if (c === '}') {
        depth -= 1
        if (depth === 0) break
      } else if (depth === 1 && text.slice(i, i + 3) === 'if ' || (depth === 1 && text.startsWith('if(', i))) {
        hits.push(match.index)
        break
      }
    }
  }
  return hits
}

export const scanText = (rel, text) => {
  const hits = []
  const add = (index, rule, message) => hits.push({ file: rel, line: lineOf(text, index), rule, message })
  const test = /\.(test|spec)\.(ts|tsx)$/.test(rel) || rel.includes('/tests/')
  const api = rel.includes('/api/')

  for (const index of nestedIfs(text)) add(index, 'nested-if', 'nested if — return early or use {cond && <Node />}')

  for (const match of text.matchAll(/\b(?:const|let)\s+[A-Za-z0-9_]+\s*=\s*t\s*\(/g)) {
    add(match.index, 'translated-local', 't(...) stored in a local — call t(key) at the JSX')
  }
  for (const match of text.matchAll(/key=\{`\$\{[^`]*index/g)) {
    add(match.index, 'index-key', 'key uses the array index — use a stable id')
  }
  for (const match of text.matchAll(/<input(\s|>|\/)/g)) add(match.index, 'raw-input', 'raw <input> — use the shared/ui field')
  for (const match of text.matchAll(/\blocalStorage\b/g)) add(match.index, 'local-storage', 'localStorage — do not keep view state beside the URL')

  for (const match of text.matchAll(/<Button\b[^>]*className=(?:\{[^}]*\}|"[^"]*"|'[^']*')/g)) {
    if (BUTTON_LOOK.test(match[0])) add(match.index, 'button-class', 'className on Button sets look — add a variant on the primitive')
  }

  if (!api) {
    for (const match of text.matchAll(/\b(useQuery|useMutation)\s*\(/g)) {
      add(match.index, 'query-outside-api', `${match[1]} outside api/ — define the hook in api/ and import it`)
    }
  }

  if (rel.endsWith('.tsx') && !test) {
    for (const match of text.matchAll(/\blet\s+/g)) add(match.index, 'component-let', 'let in a component — a condition is a const')
    for (const match of text.matchAll(/\b(?:const|let)\s+(isLoading|isFetching|isPending|isError|error)\s*=/g)) {
      add(match.index, 'query-state-local', `${match[1]} is a second flag — destructure it from the query`)
    }
  }

  for (const match of text.matchAll(/\(\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z0-9_]+)\s*=>[\s\S]{0,400}?\)\s*\(/g)) {
    add(match.index, 'iife', 'IIFE — name the function outside and call it')
  }
  for (const match of text.matchAll(/\(\s*function\s*\([^)]*\)\s*\{[\s\S]{0,400}?\}\s*\)\s*\(/g)) {
    add(match.index, 'iife', 'IIFE — name the function outside and call it')
  }
  return hits
}

const selfCheck = () => {
  const sample = `
    if (ready) {
      if (open) return null
    }
    const label = t(keys.empty)
    <li key={\`\${row.id}-\${index}\`} />
    <input />
    localStorage.setItem('q', '1')
    <Button className="bg-red-500" />
    useMutation({ mutationFn })
    let button = null
    const isLoading = true
    const value = (() => 1)()
  `
  const rules = new Set(scanText('src/features/files/ui/files-list/files-list.tsx', sample).map((hit) => hit.rule))
  const expected = ['nested-if', 'translated-local', 'index-key', 'raw-input', 'local-storage', 'button-class', 'query-outside-api', 'component-let', 'query-state-local', 'iife']
  const missing = expected.filter((rule) => !rules.has(rule))
  if (missing.length) {
    console.error(`self-check missed: ${missing.join(', ')}`)
    process.exit(1)
  }
  console.log('OK: self-check')
}

const args = process.argv.slice(2)
if (args.includes('--self-check')) {
  selfCheck()
  if (args.length === 1) process.exit(0)
}

const opt = { root: process.cwd(), base: '', files: null }
for (let i = 0; i < args.length; i++) {
  const arg = args[i]
  if (arg === '--self-check') continue
  if (arg === '--root') opt.root = path.resolve(args[++i] ?? '')
  else if (arg === '--base') opt.base = args[++i] ?? ''
  else if (arg === '--files') opt.files = (args[++i] ?? '').split(',').filter(Boolean)
  else {
    console.error(`unknown argument: ${arg}`)
    process.exit(2)
  }
}

const git = (gitArgs) => {
  try {
    return execFileSync('git', gitArgs, { cwd: opt.root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      .split('\n').map((line) => line.trim()).filter(Boolean)
  } catch {
    return []
  }
}

const names = opt.files ?? [
  ...git(['diff', '--relative', '--name-only', '--diff-filter=ACMR', 'HEAD']),
  ...git(['ls-files', '--others', '--exclude-standard']),
  ...(opt.base ? git(['diff', '--relative', '--name-only', '--diff-filter=ACMR', `${opt.base}...HEAD`]) : []),
]
const code = names.filter((rel) => /\.(ts|tsx)$/.test(rel) && !rel.endsWith('.d.ts'))
const hits = []
for (const rel of code) {
  const abs = path.join(opt.root, rel)
  if (!existsSync(abs)) continue
  hits.push(...scanText(rel, readFileSync(abs, 'utf8')))
}
for (const hit of hits) console.error(`${hit.file}:${hit.line} ${hit.rule}: ${hit.message}`)
if (hits.length) process.exit(1)
console.log('OK: no pattern hits')

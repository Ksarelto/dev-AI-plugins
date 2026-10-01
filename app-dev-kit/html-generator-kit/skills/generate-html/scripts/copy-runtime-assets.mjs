#!/usr/bin/env node
// Copies the fixed-content runtime JS assets into a prototype's js/ directory, byte-for-byte.
//
// js/app.js and js/store.js (and, when vendored, the Alpine vendor files) have zero ⟨SLOT⟩s — they
// are pure "copy as-is" files. Having an LLM retype several hundred lines of fixed JS into Write
// every single build risked silent truncation or a dropped line with nothing to catch it. This
// script does the copy mechanically instead.
//
// Usage:
//   node copy-runtime-assets.mjs --out <OUTPUT_DIR>
//
// Copies:
//   templates/runtime/app.js                       -> {OUTPUT_DIR}/js/app.js
//   templates/runtime/store.js                     -> {OUTPUT_DIR}/js/store.js
//   templates/runtime/vendor/alpine.min.js          -> {OUTPUT_DIR}/js/vendor/alpine.min.js
//   templates/runtime/vendor/alpine-focus.min.js    -> {OUTPUT_DIR}/js/vendor/alpine-focus.min.js
//
// Exit code: 0 = all files copied, 1 = a required source file is missing, 2 = usage error.

import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const RUNTIME_DIR = join(here, '..', 'templates', 'runtime')

function flag(args, name) {
  const i = args.indexOf(`--${name}`)
  if (i < 0) return ''
  const next = args[i + 1]
  if (!next || next.startsWith('--')) return ''
  return next
}

// Required: app.js / store.js always exist. Vendor files are optional — a kit checkout where
// Alpine vendoring was skipped (no network access at build time) should not fail every prototype
// build; it just means the old CDN tags are still in the templates and nothing needs copying here.
const REQUIRED = [
  { from: join(RUNTIME_DIR, 'app.js'), to: ['js', 'app.js'] },
  { from: join(RUNTIME_DIR, 'store.js'), to: ['js', 'store.js'] },
]
const OPTIONAL = [
  { from: join(RUNTIME_DIR, 'vendor', 'alpine.min.js'), to: ['js', 'vendor', 'alpine.min.js'] },
  { from: join(RUNTIME_DIR, 'vendor', 'alpine-focus.min.js'), to: ['js', 'vendor', 'alpine-focus.min.js'] },
]

export function copyRuntimeAssets(outDir) {
  const written = []
  const errors = []

  for (const { from, to } of REQUIRED) {
    if (!existsSync(from)) {
      errors.push(`missing required source: ${from}`)
      continue
    }
    const dest = join(outDir, ...to)
    mkdirSync(dirname(dest), { recursive: true })
    copyFileSync(from, dest)
    written.push(join(...to))
  }

  const vendorAvailable = OPTIONAL.every(({ from }) => existsSync(from))
  if (vendorAvailable) {
    for (const { from, to } of OPTIONAL) {
      const dest = join(outDir, ...to)
      mkdirSync(dirname(dest), { recursive: true })
      copyFileSync(from, dest)
      written.push(join(...to))
    }
  }

  return { written, errors, vendorCopied: vendorAvailable }
}

function main() {
  const args = process.argv.slice(2)
  const out = flag(args, 'out')
  if (!out) {
    console.error('usage: copy-runtime-assets.mjs --out <OUTPUT_DIR>')
    process.exit(2)
  }
  if (!existsSync(out)) {
    console.error(`FATAL: --out not found: ${out}`)
    process.exit(2)
  }

  const { written, errors, vendorCopied } = copyRuntimeAssets(out)

  if (errors.length) {
    console.error(`ERRORS (${errors.length}):`)
    errors.forEach((e) => console.error(`  ✗ ${e}`))
    process.exit(1)
  }

  console.log(`OK: ${written.length} file(s) copied (${written.join(', ')})${vendorCopied ? '' : ' — Alpine vendor files not present, CDN tags still in use'}`)
}

const isMain = (() => {
  try { return process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1] } catch { return false }
})()
if (isMain) main()

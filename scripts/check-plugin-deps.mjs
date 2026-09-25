#!/usr/bin/env node
// Copy one plugin away from this repo's node_modules, install its deps, and
// confirm analyze-capabilities.mjs can import yaml.

import { spawnSync } from 'node:child_process'
import { cpSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = join(root, 'app-dev-kit', 'app-orchestrator-kit')
const parent = mkdtempSync(join(tmpdir(), 'plugin-deps-'))
const dest = join(parent, 'app-orchestrator-kit')

function fail(message, detail = '') {
  console.error(message)
  if (detail) console.error(detail)
  rmSync(parent, { recursive: true, force: true })
  process.exit(1)
}

cpSync(src, dest, {
  recursive: true,
  filter: (from) => {
    const rel = from.slice(src.length)
    return !rel.split(sep).includes('node_modules')
  },
})

const specDir = join(parent, 'fixture')
mkdirSync(specDir)
const spec = join(specDir, 'spec.md')
writeFileSync(spec, `---
metadata:
  title: Fixture
ui-surface:
  screens:
    - id: SCR-001
      title: Home
      route: /
---
# Fixture
`)

const install = spawnSync('npm', ['install', '--omit=dev'], { cwd: dest, stdio: 'inherit' })
if (install.status !== 0) fail('FAIL: npm install in copied plugin')

const script = join(dest, 'skills', 'orchestrate-app', 'scripts', 'analyze-capabilities.mjs')
const run = spawnSync(process.execPath, [script, spec], { cwd: parent, encoding: 'utf8' })
const out = `${run.stdout ?? ''}\n${run.stderr ?? ''}`
if (out.includes('not installed in this plugin') || out.includes('not resolvable')) {
  fail('FAIL: yaml still unresolved from the copied plugin', out)
}
if (run.status !== 0) fail(`FAIL: analyze-capabilities exited ${run.status}`, out)

rmSync(parent, { recursive: true, force: true })
console.log('OK: yaml resolved from copied plugin')

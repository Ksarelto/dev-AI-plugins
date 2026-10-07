#!/usr/bin/env node
// Host preflight before the first build station: finds the setup gaps that otherwise surface as
// red gates and Station 11 fix spawns (missing gate scripts, generated .spec files linted or staged).
// Reports only — it never edits the host. The calling skill asks the human once and applies the fix.
//
// Usage: node preflight-host.mjs [--root <dir>] [--json]
// Exit 0 no issues · 1 issues found · 2 usage error.

import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const args = process.argv.slice(2)
const rootAt = args.indexOf('--root')
const root = rootAt >= 0 ? args[rootAt + 1] : process.cwd()
const asJson = args.includes('--json')
if (!root || !existsSync(join(root, 'package.json'))) {
  console.error(`usage: preflight-host.mjs [--root <dir>] [--json] — no package.json in ${root}`)
  process.exit(2)
}

const issues = []
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const scripts = pkg.scripts ?? {}

// run-gates.sh fails a gate whose package.json script is missing (quality-gates.md owns the list).
const GATE_SCRIPTS = { typecheck: 'types', lint: 'lint', 'lint:fsd': 'fsd', build: 'build', 'test:auto': 'coverage' }
for (const [script, gate] of Object.entries(GATE_SCRIPTS)) {
  if (!scripts[script]) {
    issues.push({
      id: `script:${script}`,
      problem: `package.json has no "${script}" script — the ${gate} gate will fail`,
      fix: script === 'lint:fsd'
        ? 'Add an FSD import-boundary check, e.g. "lint:fsd": "steiger ./src" or "depcruise --config .dependency-cruiser.cjs src" (human picks the tool; a new package needs approval)'
        : `Add a "${script}" script (see quality-gates.md for what the ${gate} gate runs)`,
    })
  }
}

// The html prototype and other generated files under .spec/ are not app code.
const eslintConfigs = [
  ...['eslint.config.js', 'eslint.config.mjs', 'eslint.config.cjs', 'eslint.config.ts', '.eslintrc', '.eslintrc.js', '.eslintrc.cjs', '.eslintrc.json', '.eslintignore'],
  ...(existsSync(join(root, 'config/eslint')) ? readdirSync(join(root, 'config/eslint')).map((f) => `config/eslint/${f}`) : []),
].filter((f) => existsSync(join(root, f)))
if (scripts.lint && eslintConfigs.length && !eslintConfigs.some((f) => readFileSync(join(root, f), 'utf8').includes('.spec'))) {
  issues.push({
    id: 'eslint:ignore-spec',
    problem: `ESLint config (${eslintConfigs.join(', ')}) does not ignore .spec/ — the prototype JS fails the lint gate`,
    fix: "Add '.spec/**' to the ESLint ignores (flat config: globalIgnores(['.spec/**']) or ignores: ['.spec/**'])",
  })
}

// commit-feature.sh stages the worktree; the gate transcript and derived work cards are not source.
const ignored = (path) => {
  try {
    execFileSync('git', ['check-ignore', '-q', path], { cwd: root, stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}
let inGit = true
try {
  execFileSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: root, stdio: 'ignore' })
} catch {
  inGit = false
}
if (inGit) {
  const UNTRACKED = [
    { id: 'gitignore:gate-log', probe: '.spec/.gate-log', pattern: '.spec/.gate-log', what: 'gate transcript' },
    { id: 'gitignore:cards', probe: '.spec/features/x.context/cards/row-1.md', pattern: '.spec/features/*.context/cards/', what: 'derived work cards' },
  ]
  for (const { id, probe, pattern, what } of UNTRACKED) {
    if (ignored(probe)) continue
    issues.push({ id, problem: `${pattern} (${what}) is not git-ignored — commit-feature.sh would stage it`, fix: `Add "${pattern}" to .gitignore` })
  }
}

if (asJson) console.log(JSON.stringify({ ok: issues.length === 0, issues }))
else if (!issues.length) console.log('OK: host preflight — no issues')
else for (const i of issues) console.log(`ISSUE [${i.id}] ${i.problem}\n  fix: ${i.fix}`)
process.exit(issues.length ? 1 : 0)

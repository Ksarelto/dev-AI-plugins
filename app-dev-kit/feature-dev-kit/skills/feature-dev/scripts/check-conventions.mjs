#!/usr/bin/env node
// Deterministic convention checks for a feature-dev-kit React app (the `conventions` gate).
// Parses changed src/ files with the host app's own `typescript` package — no extra dependency.
// Rules are owned by frontend-dev-kit rules/{general-coding-principles,react,styling,shadcn,i18n,testing}.mdc;
// this script only enforces the mechanically checkable subset.
//
// Usage: check-conventions.mjs [--root <dir>] [--base <ref>] [--all] [--files a,b] [--ignore r1,r2] [--json]
//   --root   app root holding package.json and src/ (default: cwd)
//   --base   also include files changed on the branch since <ref> (merge-base diff)
//   --all    check every file under src/ instead of the changed set
//   --files  comma-separated paths (relative to --root) instead of the changed set
//   --ignore comma-separated rule ids to drop. Worker self-checks: missing-test before Station 8, and
//            unused-export before Station 7 (later layers and app wiring import those exports).
//            Never passed by run-gates.sh — the gate always runs every rule.
//   --json   print one JSON object instead of text lines
//
// Exit: 0 no errors (warnings allowed) · 1 at least one error · 2 usage/setup error.

import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

const args = process.argv.slice(2)
const opt = { root: process.cwd(), base: '', all: false, files: null, ignore: new Set(), json: false }

for (let i = 0; i < args.length; i++) {
  const a = args[i]
  if (a === '--root') opt.root = path.resolve(args[++i] ?? '')
  else if (a === '--base') opt.base = args[++i] ?? ''
  else if (a === '--all') opt.all = true
  else if (a === '--files') opt.files = (args[++i] ?? '').split(',').filter(Boolean)
  else if (a === '--ignore') opt.ignore = new Set((args[++i] ?? '').split(',').filter(Boolean))
  else if (a === '--json') opt.json = true
  else {
    console.error(`unknown argument: ${a}`)
    process.exit(2)
  }
}

const loadTypescript = () => {
  const requirers = [createRequire(path.join(opt.root, 'package.json')), createRequire(import.meta.url)]
  for (const req of requirers) {
    for (const name of ['typescript', 'typescript-api']) {
      try {
        const mod = req(name)
        if (typeof mod.createSourceFile === 'function') return mod
      } catch {}
    }
  }
  return null
}

const ts = loadTypescript()
if (!ts) {
  console.error(
    `check-conventions: no TypeScript compiler API found from ${opt.root}. ` +
      'TypeScript 7 ships no JS API — add the 6.x API as an alias: npm i -D typescript-api@npm:typescript@^6',
  )
  process.exit(2)
}

const SRC = path.join(opt.root, 'src')
const rel = (abs) => path.relative(opt.root, abs).split(path.sep).join('/')

const walk = (dir, out = []) => {
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue
    const abs = path.join(dir, name)
    if (statSync(abs).isDirectory()) walk(abs, out)
    else out.push(abs)
  }
  return out
}

const git = (gitArgs) => {
  try {
    return execFileSync('git', gitArgs, { cwd: opt.root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
  } catch {
    return []
  }
}

const changedFiles = () => {
  if (opt.files) return opt.files.map((f) => path.resolve(opt.root, f))
  if (opt.all) return walk(SRC)
  const names = new Set([
    ...git(['diff', '--relative', '--name-only', '--diff-filter=ACMR', 'HEAD']),
    ...git(['ls-files', '--others', '--exclude-standard']),
    ...(opt.base ? git(['diff', '--relative', '--name-only', '--diff-filter=ACMR', `${opt.base}...HEAD`]) : []),
  ])
  return [...names].map((f) => path.resolve(opt.root, f))
}

const isCode = (f) => /\.(ts|tsx)$/.test(f) && !f.endsWith('.d.ts')
const isTest = (f) => /\.(test|spec)\.(ts|tsx)$/.test(f) || /\/tests\//.test(f) || /\/src\/test\//.test(f)
const isStory = (f) => /\.stories\.(ts|tsx)$/.test(f)
const inSharedUi = (f) => rel(f).startsWith('src/shared/ui/')
const inLocales = (f) => /\/locales\//.test(f)
const base = (f) => path.basename(f).replace(/\.(ts|tsx)$/, '')

const TEST_EXEMPT = /^(index|types|constants|styles|main|vite-env|setupTests|setup-tests)$/
const MOTION = /^(animate-|transition($|-)|duration-|delay-|ease-|fade-(in|out)|slide-(in|out)-|zoom-(in|out)|spin-(in|out))/
const COPY_ATTRS = new Set([
  'aria-label', 'aria-description', 'aria-placeholder', 'aria-valuetext', 'aria-roledescription',
  'alt', 'title', 'placeholder', 'label', 'description', 'heading', 'tooltip', 'helperText', 'emptyText', 'message',
])
const CLOSED_SET_PROPS = new Set(['variant', 'size', 'type', 'side', 'align', 'orientation', 'intent'])
const ZOD_MSG_ALL_ARGS = new Set([
  'email', 'url', 'uuid', 'cuid', 'cuid2', 'nonempty', 'int', 'positive', 'negative', 'nonnegative',
  'nonpositive', 'finite', 'datetime', 'date', 'time', 'ip', 'emoji', 'nanoid', 'base64',
])
const ZOD_MSG_AFTER_FIRST = new Set([
  'min', 'max', 'length', 'regex', 'refine', 'gt', 'gte', 'lt', 'lte', 'multipleOf', 'step',
  'startsWith', 'endsWith', 'includes', 'size',
])
const ZOD_MSG_KEYS = new Set(['message', 'error', 'required_error', 'invalid_type_error', 'description'])

const findings = []
const report = (file, sf, pos, severity, rule, message) => {
  if (opt.ignore.has(rule)) return
  const { line, character } = sf ? sf.getLineAndCharacterOfPosition(pos) : { line: 0, character: 0 }
  findings.push({ file: rel(file), line: line + 1, col: character + 1, severity, rule, message })
}

const unwrap = (n) => {
  let node = n
  while (node && ts.isParenthesizedExpression(node)) node = node.expression
  return node
}

const hasLetters = (s) => /\p{L}/u.test(s)
const stripEntities = (s) => s.replace(/&[a-z]+;|&#x?[0-9a-f]+;/gi, '')
const isCopyLike = (s) => {
  const t = s.trim()
  return /\s/.test(t) && hasLetters(t) && (/\p{Lu}/u.test(t) || /[.?!…:]$/.test(t))
}
const literalText = (n) => {
  const node = unwrap(n)
  if (!node) return null
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text
  if (ts.isTemplateExpression(node)) return node.head.text + node.templateSpans.map((s) => s.literal.text).join(' ')
  return null
}

const parse = (file) => {
  const text = readFileSync(file, 'utf8')
  const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  return { text, sf: ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind) }
}

const zodChainRoot = (call) => {
  let node = call.expression
  while (node) {
    if (ts.isPropertyAccessExpression(node)) node = node.expression
    else if (ts.isCallExpression(node)) node = node.expression
    else break
  }
  return node && ts.isIdentifier(node) ? node.text : null
}

const tagName = (attr) => {
  const owner = attr.parent?.parent
  if (owner && (ts.isJsxOpeningElement(owner) || ts.isJsxSelfClosingElement(owner))) return owner.tagName.getText()
  return ''
}

const insideJsxBeforeFunction = (node) => {
  let p = node.parent
  while (p) {
    if (ts.isFunctionLike(p)) return false
    if (ts.isJsxExpression(p) || ts.isJsxAttribute(p)) return true
    p = p.parent
  }
  return false
}

const checkComments = (file, sf, text) => {
  const jsxTexts = []
  const collect = (n) => {
    if (ts.isJsxText(n)) jsxTexts.push([n.pos, n.end])
    ts.forEachChild(n, collect)
  }
  collect(sf)
  const inJsxText = (pos) => jsxTexts.some(([s, e]) => pos >= s && pos < e)

  const seen = new Set()
  const visit = (n) => {
    if (ts.isJsxText(n)) return
    const ranges = []
    if (!inJsxText(n.pos)) ranges.push(...(ts.getLeadingCommentRanges(text, n.pos) ?? []))
    if (!inJsxText(n.end)) ranges.push(...(ts.getTrailingCommentRanges(text, n.end) ?? []))
    for (const r of ranges) {
      if (seen.has(r.pos)) continue
      seen.add(r.pos)
      const body = text.slice(r.pos, r.end)
      if (/^\/\/\/\s*<reference\b/.test(body) || /@vite-ignore/.test(body)) continue
      if (/eslint-(disable|enable)/.test(body)) {
        report(file, sf, r.pos, 'warn', 'lint-directive', 'lint suppression — fix the code instead where possible')
        continue
      }
      report(file, sf, r.pos, 'error', 'comment', `comment in code: ${body.split('\n')[0].slice(0, 60)}`)
    }
    for (const child of n.getChildren(sf)) visit(child)
  }
  visit(sf)
}

const checkAst = (file, sf) => {
  const test = isTest(file)
  const story = isStory(file)
  const styles = base(file) === 'styles'
  const sharedUi = inSharedUi(file)
  const locales = inLocales(file)

  const visit = (n) => {
    if (ts.isConditionalExpression(n)) {
      const branches = [n.condition, n.whenTrue, n.whenFalse].map(unwrap)
      if (branches.some((b) => b && ts.isConditionalExpression(b))) {
        report(file, sf, n.getStart(sf), 'error', 'nested-ternary', 'nested ternary — use early returns or a lookup map')
      } else if (!test && !sharedUi && insideJsxBeforeFunction(n)) {
        report(file, sf, n.getStart(sf), 'warn', 'jsx-ternary', 'ternary in JSX — compute the value before return')
      }
    }

    if (ts.isExportDeclaration(n) && !n.exportClause && n.moduleSpecifier) {
      report(file, sf, n.getStart(sf), 'error', 'export-star', '`export *` — re-export only the names another file imports')
    }

    if (ts.isJsxAttribute(n) && !test) {
      const name = n.name.getText(sf)
      const init = n.initializer
      const expr = init && ts.isJsxExpression(init) ? unwrap(init.expression) : init

      if (name === 'className' && expr) {
        const inlineCall = ts.isCallExpression(expr) && ['cn', 'clsx', 'twMerge', 'cx'].includes(expr.expression.getText(sf))
          && expr.arguments.some((a) => literalText(a) !== null && literalText(a).trim() !== '')
        if (literalText(expr) !== null || inlineCall) {
          report(file, sf, n.getStart(sf), 'error', 'inline-class', 'class string in JSX — move it to styles.ts')
        } else if (ts.isConditionalExpression(expr)) {
          report(file, sf, n.getStart(sf), 'error', 'inline-class', 'ternary in className — use a styles.ts function or cva variant')
        }
      }
      if (name === 'style' && !sharedUi) {
        report(file, sf, n.getStart(sf), 'error', 'inline-class', 'inline style — use styles.ts (a CSS variable for a dynamic value)')
      }
      if (!sharedUi && /^on[A-Z]/.test(name) && expr && (ts.isArrowFunction(expr) || ts.isFunctionExpression(expr))) {
        report(file, sf, n.getStart(sf), 'error', 'inline-handler', `inline ${name} handler — declare handleX above the return`)
      }
      if (!story && COPY_ATTRS.has(name) && expr) {
        const value = literalText(expr)
        if (value !== null && hasLetters(value)) {
          report(file, sf, n.getStart(sf), 'error', 'hardcoded-copy', `${name}="${value.slice(0, 40)}" — use t(key)`)
        }
      }
      if (!story && !sharedUi && CLOSED_SET_PROPS.has(name) && expr && /^[A-Z]/.test(tagName(n))) {
        const value = literalText(expr)
        if (value !== null) {
          report(file, sf, n.getStart(sf), 'error', 'magic-prop', `${name}="${value}" on <${tagName(n)}> — use the primitive's constant, or omit a default`)
        }
      }
    }

    if (ts.isJsxExpression(n) && n.expression && !test && !story && n.parent
      && (ts.isJsxElement(n.parent) || ts.isJsxFragment(n.parent))) {
      const leaves = []
      const collectLeaves = (e) => {
        const node = unwrap(e)
        if (!node) return
        if (ts.isConditionalExpression(node)) {
          collectLeaves(node.whenTrue)
          collectLeaves(node.whenFalse)
        } else if (ts.isBinaryExpression(node) && [ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken,
          ts.SyntaxKind.QuestionQuestionToken].includes(node.operatorToken.kind)) {
          collectLeaves(node.right)
        } else if (literalText(node) !== null) {
          leaves.push(node)
        }
      }
      collectLeaves(n.expression)
      for (const leaf of leaves) {
        const value = literalText(leaf)
        if (hasLetters(value)) {
          report(file, sf, leaf.getStart(sf), 'error', 'hardcoded-copy', `string "${value.slice(0, 40)}" rendered in JSX — use t(key)`)
        }
      }
    }

    if (ts.isJsxText(n) && !test && !story) {
      const value = stripEntities(n.text).trim()
      if (value && hasLetters(value)) {
        report(file, sf, n.getStart(sf), 'error', 'hardcoded-copy', `JSX text "${value.slice(0, 40)}" — use t(key)`)
      }
    }

    if (ts.isCallExpression(n) && !test && !story) {
      const callee = n.expression.getText(sf)
      if (/^(notify|toast)(\.(success|error|info|warning|message))?$/.test(callee)) {
        const value = n.arguments[0] && literalText(n.arguments[0])
        if (value && hasLetters(value)) {
          report(file, sf, n.getStart(sf), 'error', 'hardcoded-copy', `${callee}("${value.slice(0, 40)}") — pass t(key)`)
        }
      }
      if (zodChainRoot(n) === 'z') {
        const method = ts.isPropertyAccessExpression(n.expression) ? n.expression.name.text : ''
        const candidates = ZOD_MSG_ALL_ARGS.has(method)
          ? n.arguments
          : ZOD_MSG_AFTER_FIRST.has(method) ? n.arguments.slice(1) : []
        for (const a of candidates) {
          const value = literalText(a)
          if (value && hasLetters(value)) {
            report(file, sf, a.getStart(sf), 'error', 'hardcoded-copy', `zod message "${value.slice(0, 40)}" — use a translation key`)
          }
        }
        for (const a of n.arguments) {
          if (!ts.isObjectLiteralExpression(a)) continue
          for (const p of a.properties) {
            if (!ts.isPropertyAssignment(p) || !ZOD_MSG_KEYS.has(p.name.getText(sf))) continue
            const value = literalText(p.initializer)
            if (value && hasLetters(value) && p.name.getText(sf) !== 'description') {
              report(file, sf, p.getStart(sf), 'error', 'hardcoded-copy', `zod ${p.name.getText(sf)} "${value.slice(0, 40)}" — use a translation key`)
            }
          }
        }
      }
    }

    if (ts.isObjectLiteralExpression(n) && !test && !story && !locales && !styles) {
      const stringProps = n.properties.filter((p) => ts.isPropertyAssignment(p) && literalText(p.initializer) !== null)
      const copyProps = stringProps.filter((p) => isCopyLike(literalText(p.initializer)))
      const parentCall = n.parent && ts.isCallExpression(n.parent) ? n.parent.expression.getText(sf) : ''
      if (stringProps.length >= 2 && copyProps.length >= 1 && !['cva', 'cn'].includes(parentCall)) {
        report(file, sf, n.getStart(sf), 'error', 'string-map', 'object of English copy — move the strings to en.json and map to keys')
      }
    }

    if (styles && !sharedUi && (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n))) {
      const motion = n.text.split(/\s+/).filter((tok) => MOTION.test(tok.split(':').pop().replace(/^!/, '')))
      if (motion.length) {
        report(file, sf, n.getStart(sf), 'error', 'motion-utility', `${motion.join(' ')} outside shared/ui — primitives own their motion`)
      }
    }

    ts.forEachChild(n, visit)
  }
  visit(sf)
}

const isExecutable = (sf) => {
  let found = false
  const visit = (n) => {
    if (found) return
    if (ts.isFunctionLike(n) && !ts.isTypeNode(n) && !ts.isMethodSignature(n) && !ts.isCallSignatureDeclaration(n)
      && !ts.isConstructSignatureDeclaration(n) && !ts.isIndexSignatureDeclaration(n)) found = true
    else if (ts.isClassDeclaration(n)) found = true
    else if (!ts.isInterfaceDeclaration(n) && !ts.isTypeAliasDeclaration(n)) ts.forEachChild(n, visit)
  }
  for (const st of sf.statements) {
    if (ts.isExpressionStatement(st) && ts.isCallExpression(unwrap(st.expression))) return true
    visit(st)
  }
  return found
}

const testCandidates = (file) => {
  const b = base(file)
  const names = [`${b}.test.ts`, `${b}.test.tsx`, `${b}.spec.ts`, `${b}.spec.tsx`]
  const dirs = [path.dirname(file)]
  for (let d = path.dirname(file); d.startsWith(SRC); d = path.dirname(d)) dirs.push(path.join(d, 'tests'))
  const out = dirs.flatMap((d) => names.map((n) => path.join(d, n)))
  if (inSharedUi(file)) {
    const folder = path.basename(path.dirname(file))
    out.push(path.join(path.dirname(file), `${folder}.test.tsx`), path.join(path.dirname(file), `${folder}.test.ts`))
  }
  return out
}

const checkMissingTest = (file, sf) => {
  if (isTest(file) || isStory(file) || inLocales(file) || TEST_EXEMPT.test(base(file)) || /\.types$/.test(base(file))) return
  if (!isExecutable(sf)) return
  if (testCandidates(file).some((c) => existsSync(c))) return
  report(file, sf, 0, 'error', 'missing-test', `no test — add ${base(file)}.test.${file.endsWith('.tsx') ? 'tsx' : 'ts'} (colocated for a component, tests/ otherwise)`)
}

const resolveSpec = (fromFile, spec) => {
  let stem
  if (spec.startsWith('.')) stem = path.resolve(path.dirname(fromFile), spec)
  else if (spec.startsWith('@/')) stem = path.join(SRC, spec.slice(2))
  else return null
  const tries = [stem, `${stem}.ts`, `${stem}.tsx`, path.join(stem, 'index.ts'), path.join(stem, 'index.tsx')]
  return tries.find((t) => existsSync(t) && statSync(t).isFile()) ?? null
}

// fromTests: usage by test files only. A segment file's export that only its test imports is fine
// (the helper is tested directly); a slice's index.ts is its public API, so tests never count there.
const buildUsage = (fromTests = false) => {
  const usage = new Map()
  const use = (target, name) => {
    if (!target) return
    if (!usage.has(target)) usage.set(target, new Set())
    usage.get(target).add(name)
  }
  for (const file of walk(SRC).filter((f) => isCode(f) && isTest(f) === fromTests)) {
    const { sf } = parse(file)
    const namespaces = new Map()
    const visit = (n) => {
      if (ts.isImportDeclaration(n) && ts.isStringLiteral(n.moduleSpecifier)) {
        const target = resolveSpec(file, n.moduleSpecifier.text)
        const clause = n.importClause
        if (clause?.name) use(target, 'default')
        const nb = clause?.namedBindings
        if (nb && ts.isNamedImports(nb)) nb.elements.forEach((e) => use(target, (e.propertyName ?? e.name).text))
        if (nb && ts.isNamespaceImport(nb)) namespaces.set(nb.name.text, target)
        if (!clause) use(target, '*')
      }
      if (ts.isExportDeclaration(n) && n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier)) {
        const target = resolveSpec(file, n.moduleSpecifier.text)
        if (!n.exportClause) use(target, '*')
        else if (ts.isNamedExports(n.exportClause)) n.exportClause.elements.forEach((e) => use(target, (e.propertyName ?? e.name).text))
        else use(target, '*')
      }
      if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword) {
        const arg = n.arguments[0]
        if (arg && ts.isStringLiteral(arg)) use(resolveSpec(file, arg.text), '*')
      }
      if (ts.isPropertyAccessExpression(n) && ts.isIdentifier(n.expression) && namespaces.has(n.expression.text)) {
        use(namespaces.get(n.expression.text), n.name.text)
      }
      ts.forEachChild(n, visit)
    }
    visit(sf)
  }
  return usage
}

const exportedNames = (sf) => {
  const out = []
  const mods = (n) => (ts.canHaveModifiers?.(n) ? ts.getModifiers(n) : n.modifiers) ?? []
  const isExported = (n) => mods(n).some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
  const isDefault = (n) => mods(n).some((m) => m.kind === ts.SyntaxKind.DefaultKeyword)
  for (const st of sf.statements) {
    if (ts.isVariableStatement(st) && isExported(st)) {
      st.declarationList.declarations.forEach((d) => ts.isIdentifier(d.name) && out.push([d.name.text, d]))
    } else if ((ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st) || ts.isInterfaceDeclaration(st)
      || ts.isTypeAliasDeclaration(st) || ts.isEnumDeclaration(st)) && isExported(st) && !isDefault(st) && st.name) {
      out.push([st.name.text, st])
    } else if (ts.isExportDeclaration(st) && st.exportClause && ts.isNamedExports(st.exportClause)) {
      st.exportClause.elements.forEach((e) => e.name.text !== 'default' && out.push([e.name.text, e]))
    }
  }
  return out
}

const checkUnusedExports = (files, usage, testUsage) => {
  for (const file of files) {
    if (isTest(file) || isStory(file) || inSharedUi(file) || base(file) === 'main') continue
    const { sf } = parse(file)
    const used = new Set([...(usage.get(file) ?? []), ...(base(file) === 'index' ? [] : testUsage.get(file) ?? [])])
    if (used.has('*')) continue
    for (const [name, node] of exportedNames(sf)) {
      if (used.has(name)) continue
      const where = base(file) === 'index' ? 'nothing outside this folder imports it' : 'no other file imports it'
      report(file, sf, node.getStart(sf), 'error', 'unused-export', `export "${name}" — ${where}; drop the export`)
    }
  }
}

const checkCss = (file) => {
  const text = readFileSync(file, 'utf8')
  const lines = text.split('\n')
  lines.forEach((line, i) => {
    if (/@keyframes|--animate-|\banimation\s*:/.test(line)) {
      findings.push({ file: rel(file), line: i + 1, col: 1, severity: 'warn', rule: 'motion-css', message: 'custom animation in CSS — the registry bases and tw-animate-css own motion' })
    }
  })
  const imports = text.match(/@import\s+["']tw-animate-css["']/g) ?? []
  if (imports.length > 1) {
    findings.push({ file: rel(file), line: 1, col: 1, severity: 'error', rule: 'motion-css', message: 'tw-animate-css imported more than once' })
  }
}

const targets = changedFiles().filter((f) => f.startsWith(SRC + path.sep) && existsSync(f))
const codeFiles = targets.filter(isCode)

for (const file of codeFiles) {
  const { text, sf } = parse(file)
  checkComments(file, sf, text)
  checkAst(file, sf)
  checkMissingTest(file, sf)
}
for (const file of targets.filter((f) => f.endsWith('.css'))) checkCss(file)
if (codeFiles.length && !opt.ignore.has('unused-export')) checkUnusedExports(codeFiles, buildUsage(), buildUsage(true))

for (let i = findings.length - 1; i >= 0; i--) if (opt.ignore.has(findings[i].rule)) findings.splice(i, 1)

findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.col - b.col)

const errors = findings.filter((f) => f.severity === 'error')
const warnings = findings.filter((f) => f.severity === 'warn')

if (opt.json) {
  console.log(JSON.stringify({ passed: errors.length === 0, checked: targets.length, errors: errors.length, warnings: warnings.length, findings }))
} else {
  for (const f of findings) console.log(`${f.file}:${f.line}:${f.col}  ${f.severity}  ${f.rule}  ${f.message}`)
  console.log(`conventions: ${targets.length} file(s) checked, ${errors.length} error(s), ${warnings.length} warning(s)`)
}

process.exit(errors.length ? 1 : 0)

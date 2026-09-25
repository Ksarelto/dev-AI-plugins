// Shared helpers for continue / merge / archive / revert. Not a CLI.

import { readFileSync } from 'node:fs'
import { relative } from 'node:path'

export const ID_KINDS = ['US', 'SCR', 'AC', 'INT', 'API', 'AGT', 'TOOL']

export async function loadYaml() {
  const mod = await import('yaml')
  const parse = mod.parse ?? mod.default?.parse
  const stringify = mod.stringify ?? mod.default?.stringify
  if (typeof parse !== 'function' || typeof stringify !== 'function') {
    console.error('FATAL: the "yaml" package is not installed in this plugin directory. Run npm install from the plugin root.')
    process.exit(2)
  }
  return { parse, stringify }
}

export function flag(args, name) {
  const i = args.indexOf(`--${name}`)
  if (i < 0) return ''
  const next = args[i + 1]
  if (!next || next.startsWith('--')) return true
  return next
}

export function rel(root, abs) {
  return relative(root, abs).split('\\').join('/')
}

export function splitFront(raw, parse) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  if (!match) return null
  return { fm: parse(match[1]), body: raw.slice(match[0].length) }
}

export function readSpec(path, parse) {
  const split = splitFront(readFileSync(path, 'utf8'), parse)
  if (!split) {
    console.error(`FATAL: no YAML front matter in ${path}`)
    process.exit(2)
  }
  return split
}

export function writeSpec(path, fm, body, stringify) {
  const yamlText = stringify(fm, { lineWidth: 0 })
  const markdown = body.startsWith('\n') || body === '' ? body : `\n${body}`
  return `---\n${yamlText}---\n${markdown.endsWith('\n') ? markdown : `${markdown}\n`}`
}

function bump(maxes, id) {
  const match = String(id ?? '').match(/^(US|SCR|AC|INT|API|AGT|TOOL)-(\d+)$/)
  if (!match) return
  const n = Number(match[2])
  maxes[match[1]] = Math.max(maxes[match[1]] ?? 0, n)
}

function walk(node, maxes) {
  if (Array.isArray(node)) {
    for (const item of node) walk(item, maxes)
    return
  }
  if (!node || typeof node !== 'object') return
  if (typeof node.id === 'string') bump(maxes, node.id)
  for (const value of Object.values(node)) walk(value, maxes)
}

export function nextIds(fm) {
  const maxes = {}
  walk(fm, maxes)
  const next = {}
  for (const kind of ID_KINDS) next[kind] = (maxes[kind] ?? 0) + 1
  return next
}

export function screenIndex(fm) {
  const names = (fm.entities ?? []).map((entity) => entity.name).filter(Boolean)
  return (fm['ui-surface']?.screens ?? []).map((screen) => {
    const text = `${screen.title ?? ''} ${screen.notes ?? ''}`
    return {
      id: screen.id,
      title: screen.title ?? '',
      route: screen.route ?? '',
      entity: names.find((name) => text.includes(name)) ?? '',
    }
  })
}

export function idsOf(fm, key) {
  const list = key === 'screens'
    ? (fm['ui-surface']?.screens ?? [])
    : (fm['user-stories'] ?? [])
  return list.map((item) => item.id).filter(Boolean)
}

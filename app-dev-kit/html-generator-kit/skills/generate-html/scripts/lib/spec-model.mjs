// Deterministic spec → prototype model. No LLM, no truncation.
//
// Replaces the old spec-interpreter agent (lossy, capped at 15 screens / 12 fields, re-derived
// page-type by guessing the first word of `notes`). This module is the single source of truth for
// both a full build (spec-model.mjs) and an append/delta build (delta-pages.mjs) — the two must
// never disagree on a page's id, domain, or type again.
//
// Reads spec-schema 2.0 fields directly (`page-type`, `primary-entity`, enum `values`) and falls
// back to 1.x heuristics only when a 2.0 field is absent (see each function below).

export function kebab(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
}

// HTML page id: prefer an existing page-map entry (keeps ids stable across build → append →
// revise), else derive from the route, else the title, else the spec screen id. Never `scr-001`.
export function pageId(screen, pageMap = {}) {
  const mapped = pageMap[screen.id]
  if (typeof mapped === 'string' && mapped) return mapped
  const route = String(screen.route ?? '')
  const fromRoute = route === '/' ? '' : kebab(route.replace(/^\//, ''))
  return fromRoute || kebab(screen.title) || kebab(screen.id)
}

// 2.0 screens name their primary-entity explicitly. 1.x screens are matched by an entity name
// appearing in the screen's title/notes/components text (the only signal 1.x specs give us).
export function entityFor(screen, entities) {
  if ('primary-entity' in screen) {
    return entities.find((entity) => entity.name === screen['primary-entity']) ?? null
  }
  const text = `${screen.title ?? ''} ${screen.notes ?? ''} ${(screen.components ?? []).join(' ')}`
  return entities.find((entity) => entity.name && text.includes(entity.name)) ?? null
}

// Page layout archetype. 2.0 screens state `page-type` directly — trust it. 1.x screens have no
// such field, so fall back to the leading verb/phrase of `notes` (the only heuristic the old
// spec-interpreter had, kept here only as a legacy fallback, never for a 2.0 spec).
export function pageType(screen) {
  if (screen['page-type']) return screen['page-type']
  const notes = String(screen.notes ?? '').toLowerCase()
  if (/^(list|browse|filter|all\s)/.test(notes)) return 'list'
  if (/^(view|detail|manage|single\s)/.test(notes)) return 'detail'
  if (/^(create|add|new|register)/.test(notes)) return 'form'
  if (/^(dashboard|overview|summary)/.test(notes)) return 'dashboard'
  if (/^(settings|configuration|preferences)/.test(notes)) return 'settings'
  return ''
}

// The status badge field: a non-derived `status` field first, else any *Status-typed field.
// Values come from `values` (2.0), legacy `enum`, or the "One of: …" description text (1.x).
export function statusesOf(entity) {
  const fields = entity?.fields ?? []
  const field = fields.find((item) => item?.name === 'status' && !item?.derived)
    ?? fields.find((item) => /status/i.test(`${item?.name ?? ''} ${item?.type ?? ''}`))
  if (!field) return []
  if (Array.isArray(field.values) && field.values.length) return field.values.map(String)
  if (Array.isArray(field.enum)) return field.enum.map(String)
  return [...new Set(`${field.description ?? ''}`.match(/[A-Z][A-Z0-9_]{1,}/g) ?? [])]
}

function pathSegments(path) {
  return String(path ?? '').split('/').filter((part) => part && !part.startsWith('{') && !/^v\d+$/i.test(part))
}

function segmentMatches(name, segment) {
  const key = kebab(name)
  if (!key || !segment) return false
  if (segment === key || segment === `${key}s`) return true
  return key.endsWith('y') && segment === `${key.slice(0, -1)}ies`
}

// One endpoint list; 1.x specs may split reads/writes into `endpoints` + `mutations` (dedupe by id,
// a 1.x writer listed the same object in both — see consumer-contract.md § Legacy specs).
function allEndpoints(fm) {
  const api = fm['api-surface'] ?? {}
  return [...new Map([
    ...(api.endpoints ?? []),
    ...(api.mutations ?? []),
  ].map((e) => [e?.id ?? `${e?.method} ${e?.path}`, e])).values()]
}

export function apiContract(entity, screen, endpoints) {
  const contract = {}
  if (!entity) return contract
  const owned = endpoints.length === 0
    || (screen?.['api-refs'] ?? []).length > 0
    || endpoints.some((endpoint) => (
      pathSegments(endpoint.path).some((segment) => segmentMatches(entity.name, segment))
    ))
  if (!owned) return contract
  for (const field of (entity.fields ?? [])) {
    if (field?.name) contract[field.name] = field.type ?? 'string'
  }
  return contract
}

// State-machine transitions for this entity's status field, if the spec declares one. 2.0 only —
// 1.x specs have no `state-machines[]` section.
function transitionsFor(entity, stateMachines) {
  if (!entity) return []
  const statusField = (entity.fields ?? []).find((f) => /status/i.test(`${f?.name ?? ''} ${f?.type ?? ''}`))
  if (!statusField) return []
  const sm = (stateMachines ?? []).find((m) => m.field === statusField.name && m.entity === entity.name)
    ?? (stateMachines ?? []).find((m) => m.field === statusField.name)
  if (!sm) return []
  return (sm.transitions ?? []).map((t) => ({ from: t.from, to: t.to, actor: t.actor, trigger: t.trigger }))
}

// Acceptance criteria reachable from a screen via its story-refs. 2.0 only.
function acceptanceCriteriaFor(screen, userStories, acceptanceCriteria) {
  const storyRefs = new Set(screen['story-refs'] ?? [])
  if (!storyRefs.size) return []
  return (acceptanceCriteria ?? [])
    .filter((ac) => storyRefs.has(ac['story-ref']))
    .map((ac) => ({ id: ac.id, kind: ac.kind, given: ac.given, when: ac.when, then: ac.then }))
}

// Interactions whose screen-ref is this screen, with target-screen resolved to the HTML page id
// (not the spec SCR- id — screen-generator and the render check both work in HTML ids).
function interactionsFor(screenSpecId, interactions, screens, pageMap) {
  return (interactions ?? [])
    .filter((int) => int['screen-ref'] === screenSpecId)
    .map((int) => {
      const targetScreen = int['target-screen']
        ? screens.find((s) => s.id === int['target-screen'])
        : null
      return {
        id: int.id,
        trigger: int.trigger,
        response: int.response,
        target: targetScreen ? pageId(targetScreen, pageMap) : null,
      }
    })
}

function purposeOf(fm) {
  const problem = fm.context?.problem ?? ''
  const goal = fm.context?.goal ?? ''
  const users = (fm.context?.['target-users'] ?? []).join(', ')
  const parts = [problem, goal].filter(Boolean)
  if (users) parts.push(`Used by: ${users}.`)
  return parts.join(' ')
}

export function pageFields(screen, entities, endpoints, stateMachines, userStories, acceptanceCriteria, interactions, allScreens, pageMap) {
  const entity = entityFor(screen, entities)
  return {
    id: pageId(screen, pageMap),
    spec_id: screen.id,
    title: screen.title ?? '',
    description: screen.notes ?? '',
    type: pageType(screen),
    domain: kebab(entity?.name || screen.title || screen.id),
    entity: entity?.name ?? '',
    route: screen.route ?? '',
    roles: screen.roles ?? [],
    components: screen.components ?? [],
    states: screen.states ?? [],
    entity_fields: (entity?.fields ?? []).map((field) => ({
      name: field.name,
      type: field.type ?? 'string',
      ...(field.required ? { required: true } : {}),
      ...(field.derived ? { derived: true } : {}),
      ...(Array.isArray(field.values) && field.values.length ? { values: field.values } : {}),
    })),
    entity_statuses: statusesOf(entity),
    api_contract: apiContract(entity, screen, endpoints),
    transitions: transitionsFor(entity, stateMachines),
    acceptance_criteria: acceptanceCriteriaFor(screen, userStories, acceptanceCriteria),
    interactions: interactionsFor(screen.id, interactions, allScreens, pageMap),
  }
}

export function navStructure(pages) {
  const nav = {}
  for (const page of pages) {
    if (!nav[page.domain]) nav[page.domain] = []
    nav[page.domain].push(page.id)
  }
  return nav
}

// Parse a spec.md's YAML front matter. Throws with a clear message if there is none.
export function parseFrontmatter(raw, parseYaml) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match) throw new Error('no YAML front matter found')
  return parseYaml(match[1])
}

// Build the full model: every screen, every entity, no caps. `pageMap` carries over stable ids
// from a previous run (build mode passes `{}`; append/revise pass the existing page-map.json).
export function buildModel(fm, pageMap = {}) {
  const entities = fm.entities ?? []
  const endpoints = allEndpoints(fm)
  const stateMachines = fm['state-machines'] ?? []
  const userStories = fm['user-stories'] ?? []
  const acceptanceCriteria = fm['acceptance-criteria'] ?? []
  const interactions = fm['ui-surface']?.interactions ?? []
  const allScreens = (fm['ui-surface']?.screens ?? []).filter((screen) => screen.id)

  const pages = allScreens.map((screen) =>
    pageFields(screen, entities, endpoints, stateMachines, userStories, acceptanceCriteria, interactions, allScreens, pageMap))

  const entitySummaries = entities.map((entity) => ({
    name: entity.name,
    fields: (entity.fields ?? []).map((f) => ({ name: f.name, type: f.type ?? 'string' })),
    statuses: statusesOf(entity),
  }))

  const apiContracts = {}
  for (const entity of entities) {
    const contract = {}
    for (const field of (entity.fields ?? [])) {
      if (field?.name) contract[field.name] = field.type ?? 'string'
    }
    if (Object.keys(contract).length) apiContracts[entity.name] = contract
  }

  return {
    purpose: purposeOf(fm),
    pages,
    entities: entitySummaries,
    nav_structure: navStructure(pages),
    api_contracts: apiContracts,
    roles: (fm.roles ?? []).map((r) => r.name),
    spec_version: String(fm['spec-version'] ?? '1.x'),
  }
}

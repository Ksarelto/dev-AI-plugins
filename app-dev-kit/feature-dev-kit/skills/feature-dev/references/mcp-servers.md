# MCP Servers — Feature Factory prerequisites

The pipeline depends on two MCP servers. Both are Phase 0/1 prerequisites: the factory cannot source UI components or investigate dependencies without them. The proposed config lives in `{KIT_DIR}/mcp.json`; merge it into the repo root `.mcp.json` when adopting the kit.

Plugin agents **ignore** `mcpServers` on the plugin manifest (Claude Code). Cursor and Claude both
need the servers present in the **consumer** MCP config. YAML tool names on agents
(`mcp__shadcn__…`, `mcp__context7__…`) are the Claude Code form. Cursor exposes the same servers
from `mcp.json` under its own namespaced tools — do not duplicate a second YAML dialect; merge
the servers and let the host name the tools.

---

## shadcn — UI Component Registry

**Start command**: `npx shadcn@latest mcp`
**Config key in `.mcp.json`**: `"shadcn"`

### Role

The shadcn MCP server connects the factory directly to the shadcn component registry. Agents use it to browse available primitives, read component source code and documentation, and add components into the project's `shared/ui` layer — all without leaving the agent context. This is how the factory sources UI components rather than writing them from scratch.

### Used by

| Agent | Usage |
|-------|-------|
| `feature-dev` skill | Before Station 0: one search/list call. No component result → STOP |
| `code-explorer` | Browse-only: checks which shadcn components cover the feature's UI surface during context discovery |
| `shared-engineer` | Browse + add: pulls primitives into `shared/ui/<name>/` via `create-shared-ui` |
| `entities-engineer`, `features-engineer`, `slice-engineer` | Browse: if the primitive is missing from `shared/ui/<name>`, hand it to `shared-engineer` |
| `composition-engineer` | Browse: blocks for widgets, primitives from `shared/ui/<name>` |

### Registry-first workflow

1. Agent browses the registry via MCP for the required component.
2. If a match exists: agent calls the MCP add command (equivalent to `npx shadcn add <component>`).
3. Agent re-homes the file into `shared/ui/<name>/` with named export, `types.ts`, `styles.ts` (animation classes kept), and `index.ts`. No `shared/ui` mega-barrel. No second copy under `@/components/ui`.
4. If the search has no fit, hand-author and record the miss. Do not skip the search.

Adaptation checklist: `frontend-dev-kit:shadcn-usage`.

### Verification

Before Station 0, call the shadcn MCP search or list tool and require a real component in the result.

- Cursor: `search_items_in_registries` with `query` `"button"` (registries optional; the server reads `components.json`).
- Claude Code: the same call under the `mcp__shadcn__search_items_in_registries` tool name.

Pass: the payload names a component (for example `button` or `dialog`).

Fail: the tool is absent, the call errors, or the payload has no items. STOP. Do not start Station 0. Do not hand-write primitives instead.

`npx shadcn@latest mcp --help` only proves the CLI is installed. It is not this check.

---

## context7 — Version-Accurate Library Documentation

**Transport**: HTTP `https://mcp.context7.com/mcp`
**Config key in `.mcp.json`**: `"context7"`
**Secret**: `CONTEXT7_API_KEY` (Claude-compatible `${env:CONTEXT7_API_KEY}` in `{KIT_DIR}/mcp.json`)

### Role

The context7 MCP server fetches authoritative, version-specific documentation for npm libraries. During the investigation station (1a), `research-analyst` uses it to get accurate API documentation for unfamiliar packages — avoiding hallucinated APIs or documentation from the wrong version. It is also useful for confirming specific APIs of existing dependencies when the agent is unsure of a parameter or option.

### Used by

| Agent | Usage |
|-------|-------|
| `research-analyst` | Primary tool for station 1a: `resolve-library-id` → `query-docs` for dep evaluation |

### Tool flow

```
1. resolve-library-id("<library-name>")
   → returns: { id: "<context7-library-id>", name, description }

2. query-docs("<context7-library-id>", { query: "<specific topic>" })
   → returns: version-accurate documentation excerpts for the requested topic
```

Fallback when context7 cannot resolve a library: use `WebSearch` + `WebFetch` against the library's official docs. Document the fallback in the spec's `## Tech Investigation` section.

Context7 is also valuable during build stations for confirming specific API usage in already-approved libraries (e.g. "what does the `enabled` option do in `useQuery`?") — no investigation station required for this use case.

### Verification

Confirm `CONTEXT7_API_KEY` is set, then check that the plugin-declared `context7` server is connected in Claude Code / Cursor MCP settings. Expected tools: `resolve-library-id` and `query-docs`.

---

## Adoption Checklist

- [ ] Merge `{KIT_DIR}/mcp.json` into root `.mcp.json`.
- [ ] Set `CONTEXT7_API_KEY` in the environment.
- [ ] Call `search_items_in_registries` (query `button`) and get a real component back. `--help` is not enough. No result → do not start the pipeline.
- [ ] Confirm the context7 MCP shows `resolve-library-id` and `query-docs`. Missing context7 warns only; Station 1a may fall back to web search.
- [ ] Add shadcn browse tools to the UI agents (Claude Code: `mcp__shadcn__search_items_in_registries`, `mcp__shadcn__view_items_in_registries`, and `mcp__shadcn__get_item_examples_from_registries` for the registry demos composers copy part order from). Cursor uses the merged server under its own tool names.

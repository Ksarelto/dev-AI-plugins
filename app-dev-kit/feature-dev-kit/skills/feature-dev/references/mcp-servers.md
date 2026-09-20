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
| `code-explorer` | Browse-only: checks which shadcn components cover the feature's UI surface during context discovery |
| `shared-engineer` | Browse + add: pulls primitives and blocks into `shared/ui` via the `create-shared-ui` skill |
| `composition-engineer` | Browse + add: assembles shadcn blocks into widgets and pages via the `create-widget` / `create-page` skills |

### Registry-first workflow

1. Agent browses registry via MCP for the required component.
2. If a match exists: agent calls the MCP "add" command (equivalent to `npx shadcn add <component>`).
3. Agent adapts the generated file to project conventions (named export, `cn()`, tokens, `index.ts`).
4. Agent re-homes the file into `shared/ui/<component>/`.

See `rules/shadcn-ui-conventions.mdc` for the full adaptation checklist.

### Verification

Run this to confirm the server is reachable:
```bash
npx shadcn@latest mcp --help
```
Expected: the MCP tool manifest listing available tools (e.g. `list-components`, `get-component`, `add-component`).

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
- [ ] Run `npx shadcn@latest mcp --help` — confirm server responds.
- [ ] Confirm the context7 MCP shows `resolve-library-id` and `query-docs`.
- [ ] Add both servers to the `tools` array of agents that use them (Claude Code: `mcp__shadcn__…` / `mcp__context7__…` names in YAML). Cursor uses the merged servers under its own tool names.
- [ ] Confirm both servers respond before Phase 2 build stations start.

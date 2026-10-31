# dev-AI-plugins

A plugin marketplace with reusable **skills**, **rules**, **commands**, and **agents** for Claude Code and Cursor.

## Repo layout

```
.claude-plugin/marketplace.json   # Claude Code marketplace manifest
.cursor-plugin/marketplace.json   # Cursor marketplace manifest (mirrors Claude)
<plugin>/                         # most kits live at repo root
  .claude-plugin/plugin.json      # Claude Code plugin manifest
  .cursor-plugin/plugin.json      # Cursor plugin manifest (same paths)
  agents/                         # subagent definitions (.md)
  skills/                         # skill definitions (SKILL.md)
  commands/                       # slash command definitions (.md)
  rules/                          # Cursor-compatible rule files (.mdc)
  .mcp.json | mcp.json            # MCP configs (Claude default / Cursor default)
app-dev-kit/                      # nested family — marketplace source is ./app-dev-kit/<name>
  spec-dev-kit/
  html-generator-kit/
  feature-dev-kit/                # MCP file is mcp.json (plugin.json mcpServers points here)
  frontend-orchestrator-kit/
  backend-dev-kit/
  agent-dev-kit/
  app-orchestrator-kit/
app-dev-kitv2/                    # AI factory v2 (Suggestions/ design) — marketplace source is ./app-dev-kitv2/<name>
  factory/                        # engine: /factory:* skills, CLI (scripts/factory.mjs), schemas, gates, hooks
  factory-analysis/               # stage pack S0–S4: 8 agents, 10 skills, templates (also the test fixtures)
  tests/                          # not a plugin: unit tests, e2e harness + scenarios, golden tickets
  consistency-allowlist.yaml      # scheduled later-phase items and deliberate deviations
backend-boilerplate/              # runnable Express 5 + Postgres starter (not a plugin; node-backend-dev-kit mirrors it)
agent-boilerplate/                # runnable Express 5 + LangGraph.js starter (not a plugin; node-agent-dev-kit mirrors it)
Suggestions/                      # AI-factory design proposal (Markdown + Mermaid)
schemas/                          # JSON schemas for manifests
scripts/                          # validation + Cursor local install
evals/                            # discoverability evals for skills/agents (see evals/README.md)
  cases/<plugin-name>.json        # prompt -> expected skill per plugin
  cases/<plugin-name>-agents.json # prompt -> expected agent (when the kit ships agents)
  runner.mjs
```

## Plugin manifest format

Each plugin has both `.claude-plugin/plugin.json` and `.cursor-plugin/plugin.json` at its root.
Key fields (same in both):

- `name` — kebab-case, used as namespace for skills/commands: `/plugin-name:skill`
- `agents` / `skills` / `commands` / `rules` — paths to component directories. `agents` differs by harness: Claude `./agents/*.md`, Cursor `./agents/` (spec-dev-kit, html-generator-kit, and feature-dev-kit use `./cursor-agents/`)
- `mcpServers` — path to `.mcp.json` / `mcp.json` file or inline config

## Skill format (SKILL.md)

```markdown
---
name: skill-name
description: When to invoke this skill. Claude uses this to decide auto-invocation.
---

## Instructions

...skill content...
```

## Agent format

```markdown
---
name: agent-name
description: What this agent does. Claude uses this for delegation decisions.
tools: Read, Glob, Grep      # optional allowlist
model: sonnet                 # sonnet | opus | haiku
---

Agent system prompt...
```

spec-dev-kit, html-generator-kit, and feature-dev-kit point their Cursor manifest at `cursor-agents/`,
generated from `agents/` with Cursor model ids (`scripts/model-tiers.json`). After editing an agent,
run `npm run build:cursor-agents`; `npm run validate` fails while the copies are stale.

## Adding a plugin

1. Create `<plugin-name>/` at repo root, or under `app-dev-kit/` for the spec → prototype → build family. Marketplace `source` must match that directory (e.g. `./app-dev-kit/spec-dev-kit`).
2. Add matching `.claude-plugin/plugin.json` and `.cursor-plugin/plugin.json`
3. Add component directories (`skills/`, `agents/`, `rules/`, `commands/`)
4. Register in both `.claude-plugin/marketplace.json` and `.cursor-plugin/marketplace.json`
5. Add `evals/cases/<plugin-name>.json` with a case per skill (and `evals/cases/<plugin-name>-agents.json` when the kit ships agents)
6. Run `npm run validate` and `npm run eval`

Adding a skill or agent to an *existing* plugin, or changing one's `description`, requires the same
step 5 — add or update its case in that plugin's eval file. See [evals/README.md](evals/README.md).

## Boilerplates

`backend-boilerplate/` and `agent-boilerplate/` are standalone npm projects (Node 22, own `package-lock.json`, own `.gitignore`), not plugins and not in the marketplaces. Each has `typecheck`, `lint` (ESLint + dependency-cruiser layer rules), `test:unit`, `test:integration` (Testcontainers, needs Docker) and a Compose stack. When you change one, update the matching kit's examples (`node-backend-dev-kit`, `node-agent-dev-kit`) and run its checks. Do not add files named like existing kit references (`shadcn.mdc`, `mock-patterns.md`): `npm run validate` resolves cross-kit references by file name across root folders.

## Validation

```bash
npm install
npm run validate   # manifest/schema/structure checks (+ generated factory files up to date)
npm run eval        # skill/agent discoverability checks
```

## app-dev-kitv2 (AI factory)

The engine (`app-dev-kitv2/factory`) decides everything deterministically from `.factory/` files; agents
only produce artifacts. When you change it:

- `npm run test:factory` — Layer-1 tests (Node 20 and 22). Add a test for every gate rule or warden change.
- `npm run test:factory:e2e` — mocked scenarios through the real engine; a new stage or gate needs a scenario step.
- Real-model golden tickets (`tests/golden/run-golden.mjs`) cost money: never run with `--yes` without the user's OK.
- `npm run check:factory` — duplication, agent/stage wiring, model policy, line limits, unique file names,
  drift from `Suggestions/`. Update `app-dev-kitv2/consistency-allowlist.yaml` when a phase lands.
- `npm run build:factory` — after changing `factory/hooks/register.mjs` or bumping yaml/ajv/picomatch.
- ID formats live only in `factory/scripts/lib/ids.mjs`; schema patterns must match it (tested).
- Each phase ends with a fresh-context reviewer subagent pass before it is committed.

## Cursor local install

```bash
npm run install:cursor-local
```

## Current plugins

| Plugin | Path | Components | Evals |
|--------|------|-----------|-------|
| `base-dev-kit` | `base-dev-kit/` | Rules: honesty, security (always applied). Skills: clean code, dependencies, documentation, git workflow, TDD | `evals/cases/base-dev-kit.json` |
| `frontend-dev-kit` | `frontend-dev-kit/` | Rules + Skills + MCP (no agents): React 19 FSD — TypeScript, shadcn/ui, Tailwind, react-query, react-hook-form + zod, react-i18next, Vitest. Required companion of `feature-dev-kit` | `evals/cases/frontend-dev-kit.json` |
| `node-backend-dev-kit` | `node-backend-dev-kit/` | Rules + Skills + MCP (no agents): layered Node 22 + Express 5 + TS APIs — Zod 4, Drizzle/Postgres, JWT + RBAC, problem+json, pino, resilience, OpenAPI, Docker, Vitest + Testcontainers. Mirrors `backend-boilerplate/` | `evals/cases/node-backend-dev-kit.json` |
| `node-agent-dev-kit` | `node-agent-dev-kit/` | Rules + Skills + MCP (no agents): LangGraph.js + LangChain.js agent services on the same Express stack — tools, OpenRouter models, Postgres checkpoints, pgvector hybrid RAG, guardrails, SSE, evals. Requires `node-backend-dev-kit`. Mirrors `agent-boilerplate/` | `evals/cases/node-agent-dev-kit.json` |
| `factory-analysis` | `app-dev-kitv2/factory-analysis/` | Stages + 8 agents + 10 skills + templates: factory S0–S4 — intake, bootstrap/discovery, requirements (PRD or delta-spec), stories, architecture + API contract, test-first planning | `evals/cases/factory-analysis.json`, `factory-analysis-agents.json` |
| `factory` | `app-dev-kitv2/factory/` | Skills + 2 agents + rule + hooks: AI-factory engine — `/factory:*` commands, Conductor step protocol, schemas, gates, Loop Warden, context packs, HD notes. Stage/role packs plug in via manifests (phases 2–5) | `evals/cases/factory.json`, `factory-agents.json` |
| `pptx-dev-kit` | `pptx-dev-kit/` | Skills + Agents: create a 16:9 `.pptx` via design schema → outline → `deck.json` → checked-in layout renderer; or edit an existing deck via OOXML unpack/replace/pack | `evals/cases/pptx-dev-kit.json`, `pptx-dev-kit-agents.json` |
| `backend-dev-kit` | `app-dev-kit/backend-dev-kit/` | Rules + Skills + Agents + MCP: Node 22/TS Express 5 APIs with Drizzle, Zod, and Vitest; `/backend-dev` consumes a spec and optional prototype | `evals/cases/backend-dev-kit.json`, `backend-dev-kit-agents.json` |
| `agent-dev-kit` | `app-dev-kit/agent-dev-kit/` | Rules + Skills + Agents + MCP: TypeScript/Node agents and RAG with the OpenAI SDK via OpenRouter (`@openai/agents` or LangGraph.js); `/agent-dev` consumes a spec and optional prototype | `evals/cases/agent-dev-kit.json`, `agent-dev-kit-agents.json` |
| `spec-dev-kit` | `app-dev-kit/spec-dev-kit/` | Skills + 7 agents + mechanical scripts: `.spec/context/` → approved hybrid YAML+Markdown spec, read by html-generator-kit, feature-dev-kit, backend-dev-kit, and agent-dev-kit | `evals/cases/spec-dev-kit.json`, `spec-dev-kit-agents.json` |
| `html-generator-kit` | `app-dev-kit/html-generator-kit/` | Skills + 5 agents + station scripts (CSS, assembly, QA, README): approved spec → Alpine.js multi-page HTML prototype (CDN-free styling; Alpine and Google Fonts from a CDN). A provided theme, brand, mockup, or layout is binding | `evals/cases/html-generator-kit.json`, `html-generator-kit-agents.json` |
| `feature-dev-kit` | `app-dev-kit/feature-dev-kit/` | Skills + 13 agents + rules (`ui-quality`, `git-workflow`) + `mcp.json`: one FSD feature per run (nested screen-tasks share the branch and commit). Requires `frontend-dev-kit`. Hub-and-spoke, architecture-audit, human review; never a PR | `evals/cases/feature-dev-kit.json`, `feature-dev-kit-agents.json` |
| `frontend-orchestrator-kit` | `app-dev-kit/frontend-orchestrator-kit/` | Skills only: spec → html-generator → feature-dev once per feature (nested screen-tasks share that call), against a persisted checklist | `evals/cases/frontend-orchestrator-kit.json` (skills only) |
| `app-orchestrator-kit` | `app-dev-kit/app-orchestrator-kit/` | Skills only: analyze spec + prototype, then dispatch backend / agent / frontend tracks against a persisted work-plan | `evals/cases/app-orchestrator-kit.json` (skills only) |

The last seven are one pipeline family, but **seven marketplace plugins** — Claude Code and Cursor install them individually (`/plugin install spec-dev-kit@dev-AI-plugins`, or `claude --plugin-dir ./app-dev-kit/<name>` / `npm run install:cursor-local`). `frontend-orchestrator-kit` and `app-orchestrator-kit` have no agents directory.

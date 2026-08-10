# AGENTS.md

Guidance for AI coding agents working in this repo, per the [agents.md](https://agents.md) convention.
Pairs with [CLAUDE.md](CLAUDE.md) (repo layout, docs-vs-kits relationship) and
[docs/authoring/](docs/authoring/) (kit-anatomy.md for file formats, rules-vs-skills.md for the
rule/skill split). This file is the property reference and creation/orchestration flow for the four
component types — **rule**, **skill**, **command**, **agent** — plus the plugin manifest that
registers them.

## Component types at a glance

| Type | File | Loaded | Contains |
|---|---|---|---|
| Rule | `rules/<topic>.mdc` | Automatically, on glob match | Constraints — what must always be true |
| Skill | `skills/<name>/SKILL.md` | On demand, when `description` matches the task | Procedures — how to do a specific task |
| Command | `commands/<verb-noun>.md` | Only when a human/agent types `/<name>` | A deterministic multi-step script |
| Agent | `agents/<role>.md` | Only when delegated to via the `Agent` tool | A subagent with its own context, tools, model |

## Frontmatter reference

Every field below is drawn from what's actually used in this repo's kits (checked with `grep` across
`*.md` before writing this). If a field isn't listed here, don't invent it — check
`schemas/*.schema.json` first, they reject unknown keys at the manifest level.

### Rule — `rules/<topic>.mdc`

| Field | Required | Meaning |
|---|---|---|
| `description` | yes | One line, shown in rule pickers. |
| `globs` | yes (unless `alwaysApply`) | Array or string of glob patterns that auto-attach the rule. |
| `alwaysApply` | no | `true` loads the rule on every turn regardless of glob. Reserve for **at most one** rule per kit, held to ~10 lines — it's the most expensive text in the kit. |

```yaml
---
description: Icon-only buttons require aria-label.
globs: ["**/*.tsx"]
alwaysApply: false
---
```

### Skill — `skills/<name>/SKILL.md`

| Field | Required | Meaning |
|---|---|---|
| `name` | yes | kebab-case, becomes `/<plugin-name>:<name>`. |
| `description` | yes | The trigger, not a summary — the task, libraries, and verbs a user would type. This is the only thing the model sees when deciding to load the skill. |
| `argument-hint` | no | Shown next to the skill/slash command to hint expected arguments, e.g. `<ComponentName>` or `"[feature-slug or request]"`. |
| `allowed-tools` | no | Array restricting which tools the skill may use once loaded, e.g. `[Read, Write, Edit, Bash, Glob, Grep]`. Omit to allow whatever the invoking agent already has. |
| `disable-model-invocation` | no | `true` means **no agent may trigger this skill autonomously** — only a human typing the slash command can. Used for scaffolding skills that write files with side effects the human should explicitly request (see `app-dev-kit/feature-dev-kit/skills/create-page`, `create-entity`, `create-pr`, etc.). Read-only or investigative skills typically set this `false`. |
| `context` | no | Set to `fork` to run the skill in a forked subagent context instead of inline in the caller's context window. The skill executes with its own isolated context and returns only the finished result to the caller — useful for skills whose intermediate steps (search, long tool output) would otherwise bloat the caller's context. Omit to run inline (default). |

```yaml
---
name: create-page
description: Scaffold an FSD page slice. Use after the widgets/features it composes exist.
argument-hint: <PageName>
disable-model-invocation: true
allowed-tools: [Read, Write, Edit, Bash, Glob, Grep]
---
```

```yaml
---
name: research-topic
description: Investigates a broad question across the codebase and returns a summary. Use when the answer would take many searches to assemble.
context: fork
---
```

### Command — `commands/<verb-noun>.md`

| Field | Required | Meaning |
|---|---|---|
| `description` | yes | What the command does. |
| `argument-hint` | no | Same as skills. |
| `disable-model-invocation` | no | Same semantics as skills — use for commands with irreversible or human-authority effects (shipping, deploying, publishing). |

```yaml
---
description: Verify gates are green, rebase, open a PR with a body templated from the feature spec.
disable-model-invocation: true
---
```

No kit in this repo currently ships a `commands/` directory — prefer a `disable-model-invocation: true`
skill unless you specifically need the slash-command argument-parsing behavior a skill doesn't give you.

### Agent — `agents/<role>.md`

| Field | Required | Meaning |
|---|---|---|
| `name` | yes | kebab-case. |
| `description` | yes | What it does *and* when to delegate to it — this drives the Agent tool's routing, so name the triggering task explicitly. |
| `model` | no | `haiku` \| `sonnet` \| `opus` (or a full model id). Omit to inherit the caller's model. See tiering guidance below. |
| `tools` | no | Array (or comma list) of allowed tools, e.g. `[Read, Grep, Glob, Agent, Bash]`. Omit for all tools. Keep orchestrators off `Edit`/`Write` if they shouldn't author code directly. |
| `skills` | no | Array of skill names this agent is expected to invoke, e.g. `[create-widget, create-page, create-react-component]`. Documents the agent's procedure vocabulary; keep it in sync when skills are renamed. |
| `isolation` | no | `worktree` runs the agent in its own git worktree — use for parallel build workers touching different files, so they can't collide. Empty worktrees auto-clean. |
| `permissionMode` | no | `default` is what every agent in this repo uses today; only diverge with a documented reason. |
| `maxTurns` | no | Numeric guard against runaway loops — use on agents that run in a retry/fix cycle (e.g. a gate-runner). |

```yaml
---
name: composition-engineer
description: Builds the FSD widgets and pages layers. Composes entities + features into complete widgets and route-level pages.
model: sonnet
tools: [Read, Write, Edit, Bash, Glob, Grep]
skills: [create-widget, create-page, create-react-component]
isolation: worktree
permissionMode: default
---
```

### Where `license` and component *paths* actually live

Neither is a per-component frontmatter field — both belong on the **plugin manifest**
(`.claude-plugin/plugin.json` / `.cursor-plugin/plugin.json`), not on individual rule/skill/agent files:

- `license` — SPDX identifier for the whole plugin (`"license": "MIT"`), validated by
  `schemas/plugin.schema.json`.
- Component *paths* — the `agents`, `skills`, `commands`, `rules` manifest fields are each a path or
  glob (string or array) pointing at that component's directory, e.g. `"skills": "./skills/"`. This is
  also where you'd scope a plugin to only some of its components if a directory holds more than one
  kit's worth of files.

## Creation flow

1. **Write the thinking in `docs/<domain>/`** first — long-form, no frontmatter, no context budget.
   This is upstream; kit files are derived from it (see [CLAUDE.md](CLAUDE.md) § docs/ vs. kits).
2. **Split constraints from procedures.** Anything that's a prohibition or invariant becomes a rule
   bullet (`rules/<topic>.mdc`, ≤40 lines, narrowest glob that still catches violations). Everything
   that survives — the "how" — becomes a skill.
3. **Group procedures into skills** by the task a user would name, not by topic. Decide
   `disable-model-invocation` per skill: side-effecting scaffolds default to `true`; read-only or
   investigative skills default to `false`.
4. **Add agents only when you need context isolation, a restricted tool set, or a distinct model** —
   not as the default way to run a skill. If the orchestrator can just invoke the skill in its own
   context, do that instead of spawning an agent.
5. **Add commands** only for deterministic, human-invoked workflows a skill's argument-hint can't
   express cleanly (rare in this repo so far).
6. **Register in both manifests** (`.claude-plugin/plugin.json`, `.cursor-plugin/plugin.json`) and
   both marketplaces if new.
7. **Add eval cases** — one per skill/agent in `evals/cases/<plugin-name>.json`. Required any time a
   skill/agent is added *or* its `description` changes (see [evals/README.md](evals/README.md)).
8. `npm run validate && npm run eval`.

## Orchestration patterns

These are the patterns actually in use across the kits (mainly `app-dev-kit/feature-dev-kit`), not
theoretical ones — reach for them in that order before inventing a new mechanism:

- **Blackboard file, not chat state.** A long-running pipeline (e.g. a feature build) writes its state
  to a spec file on disk instead of relying on conversation history. Each worker agent updates its
  section before returning; the orchestrator reads the file, not the worker's chat output, to decide
  the next step. This survives context resets and gives a human one artifact to inspect at a review
  gate.
- **Model tiering by role, not by default.** `opus` for orchestrators and architects (sequencing,
  judgment calls), `sonnet` for implementers (writing code/tests against a spec), `haiku` for
  mechanical, high-volume, low-judgment work (gate runners, validators, spec interpreters). Don't
  default everything to the same model — it's the biggest lever after tool restriction.
- **Tool restriction encodes authority, not just cost.** An orchestrator that can't `Edit`/`Write`
  physically cannot bypass its workers. A worker with only read tools cannot cause side effects even
  if prompted to.
- **`disable-model-invocation: true` is the human-authority boundary.** Anything that ships, deploys,
  publishes, or otherwise acts outside the repo should be a skill/command with this set — no
  orchestrator or worker agent may trigger it, no matter what the pipeline decides. Document the
  boundary in the orchestrator's own instructions too (state it explicitly, don't rely on the flag
  alone) so a human reading the orchestrator's prompt sees the same guarantee.
- **`isolation: worktree` for parallel workers, not sequential ones.** Use it once multiple agents of
  the same role run concurrently over different slices of the same repo (e.g. one `entities-engineer`
  per entity). Sequential single-worker steps don't need it.
- **An agent's `skills:` list and reading list are load-bearing.** When a skill is renamed or removed,
  grep every agent file for it — a stale reference sends the agent after a procedure that no longer
  exists, and it will usually improvise rather than report the miss.

## Related

- [CLAUDE.md](CLAUDE.md) — repo layout, docs/ vs. kits, plugin manifest format
- [docs/authoring/kit-anatomy.md](docs/authoring/kit-anatomy.md) — file formats and kit build order
- [docs/authoring/rules-vs-skills.md](docs/authoring/rules-vs-skills.md) — what belongs in a rule vs. a skill
- [CONTRIBUTING.md](CONTRIBUTING.md) — submission checklist for a new or updated plugin
- [evals/README.md](evals/README.md) — eval case format for skill/agent discoverability

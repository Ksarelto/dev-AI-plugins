# Contributing

This is the authoring reference for this repo: what the four component types are, the frontmatter
each one takes, how to add or change a plugin, and what has to be green before a change ships.

- Installing and using the plugins → [README.md](README.md)
- Working in this repo as an AI coding agent → [AGENTS.md](AGENTS.md)
- Eval case format and scoring → [evals/README.md](evals/README.md)

## Anatomy of a plugin

```
<plugin-name>/
  .claude-plugin/plugin.json   # Claude Code manifest
  .cursor-plugin/plugin.json   # Cursor manifest — same name and same component paths
  README.md                    # what the plugin ships, one table per component type
  rules/<topic>.mdc
  skills/<name>/SKILL.md
  commands/<verb-noun>.md
  agents/<role>.md
  .mcp.json                    # optional
```

The two manifests are the only duplicated files. Component content is shared — both harnesses read
the same `rules/`, `skills/`, `agents/`, and `commands/` directories. Keep the manifests in sync:
`npm run validate` enforces that both exist, that both names match the marketplace entry, and that
the two marketplace plugin lists are identical.

## Choosing a component type

| Type | File | When it loads | What belongs in it |
|---|---|---|---|
| Rule | `rules/<topic>.mdc` | Automatically, on glob match (or every turn with `alwaysApply`) | Constraints — what must always be true |
| Skill | `skills/<name>/SKILL.md` | On demand, when its `description` matches the task | Procedures — how to do a specific task |
| Command | `commands/<verb-noun>.md` | Only when a human or agent types `/<name>` | A deterministic multi-step script |
| Agent | `agents/<role>.md` | Only when delegated to via the `Agent` tool | A subagent with its own context, tools, and model |

Rule of thumb for the split: if it's a prohibition or an invariant, it's a rule bullet. If it's a
"how", it's a skill. Rules cost context on every matching turn, so keep them to the narrowest glob
that still catches violations and to roughly 40 lines; skills cost nothing until they're loaded, so
they can be as long as the procedure needs.

Reach for an agent only when you need context isolation, a restricted tool set, or a different model
— not as the default way to run a skill. If the caller can just invoke the skill in its own context,
do that. Reach for a command only when you need slash-command argument parsing that a skill's
`argument-hint` can't express; no plugin here ships a `commands/` directory today.

## Frontmatter reference

Don't invent fields. Manifest-level keys are validated against `schemas/*.schema.json`, which reject
unknown properties.

### Rule — `rules/<topic>.mdc`

| Field | Required | Meaning |
|---|---|---|
| `description` | yes | One line, shown in rule pickers. |
| `globs` | yes (unless `alwaysApply`) | Glob pattern(s), string or array, that auto-attach the rule. |
| `alwaysApply` | no | `true` loads the rule every turn regardless of glob. At most **one** per plugin, held to ~10 lines — it's the most expensive text in the kit. |

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
| `name` | yes | kebab-case, max 64 chars; becomes `/<plugin-name>:<name>`. |
| `description` | yes | The **trigger**, not a summary — the task, libraries, and verbs a user would actually type. This is the only text a model sees when deciding to load the skill. |
| `argument-hint` | no | Hint for expected arguments, e.g. `<ComponentName>`. |
| `allowed-tools` | no | Array restricting tools once loaded, e.g. `[Read, Write, Edit, Bash, Glob, Grep]`. Omit to inherit whatever the invoking agent has. |
| `disable-model-invocation` | no | `true` means no agent may trigger the skill autonomously — only a human typing the slash command. Default it to `true` for side-effecting scaffolds, `false` for read-only or investigative skills. |
| `context` | no | `fork` runs the skill in a forked subagent and returns only the result, keeping search noise out of the caller's context window. Omit to run inline. |

```yaml
---
name: create-page
description: Scaffold an FSD page slice. Use after the widgets/features it composes exist.
argument-hint: <PageName>
disable-model-invocation: true
allowed-tools: [Read, Write, Edit, Bash, Glob, Grep]
---
```

### Command — `commands/<verb-noun>.md`

| Field | Required | Meaning |
|---|---|---|
| `description` | yes | What the command does. |
| `argument-hint` | no | Same as skills. |
| `disable-model-invocation` | no | Same semantics as skills — use it for irreversible effects (shipping, deploying, publishing). |

### Agent — `agents/<role>.md`

| Field | Required | Meaning |
|---|---|---|
| `name` | yes | kebab-case. |
| `description` | yes | What it does *and* when to delegate to it — this drives routing, so name the triggering task explicitly. |
| `model` | no | `haiku` \| `sonnet` \| `opus`, or a full model id. Omit to inherit the caller's model. |
| `tools` | no | Allowed tools, e.g. `[Read, Grep, Glob, Bash]`. Omit for all. Keep orchestrators off `Edit`/`Write` if they shouldn't author code directly. |
| `skills` | no | Skill names this agent is expected to invoke. Keep in sync when skills are renamed. |
| `isolation` | no | `worktree` runs the agent in its own git worktree — for parallel workers over different slices of the repo. |
| `permissionMode` | no | `default` unless you have a documented reason to diverge. |
| `maxTurns` | no | Guard against runaway loops on agents that run a retry/fix cycle. |

```yaml
---
name: composition-engineer
description: Builds the widgets and pages layers. Composes entities and features into complete widgets and route-level pages.
model: sonnet
tools: [Read, Write, Edit, Bash, Glob, Grep]
skills: [create-widget, create-page]
---
```

### Plugin manifest — `.{claude,cursor}-plugin/plugin.json`

`license` and component *paths* are manifest fields, not per-component frontmatter. `agents`,
`skills`, `commands`, and `rules` each take a path or glob (string or array) pointing at that
component's directory, e.g. `"skills": "./skills/"`. Use them to scope a plugin to a subset of a
directory's files. See [schemas/plugin.schema.json](schemas/plugin.schema.json) for the full field list.

## Adding a plugin

1. Create `<plugin-name>/` at the repo root, kebab-case.
2. Add matching `.claude-plugin/plugin.json` and `.cursor-plugin/plugin.json` — same `name`, same
   component paths.
3. Add the component files and a plugin `README.md`.
4. Register the plugin in **both** `.claude-plugin/marketplace.json` and
   `.cursor-plugin/marketplace.json` with identical `name` and `source`.
5. Add `evals/cases/<plugin-name>.json` with at least one case per skill and agent.
6. Add the plugin to the table in [README.md](README.md).
7. Run `npm run validate && npm run eval`.

## Adding or changing a skill or agent

Any time you add a skill or agent, remove one, or **change one's `description`**, add or update its
case in `evals/cases/<plugin-name>.json` in the same change. A skill whose description doesn't match
how a user would actually phrase the task is a bug even when `npm run validate` passes — that's the
gap `npm run eval` exists to close. See [evals/README.md](evals/README.md) for the case format.

When you rename or delete a skill, grep every agent file for it: a stale entry in an agent's `skills:`
list sends the agent after a procedure that no longer exists, and it will usually improvise rather
than report the miss.

## Naming conventions

Plugin, skill, agent, and command names are all lowercase kebab-case. Skill names are capped at 64
characters. Rule files are named for their topic (`security.mdc`), command files for the action
(`review-changes.md`), agent files for the role (`code-reviewer.md`).

## Orchestration patterns for multi-agent plugins

If a plugin coordinates several agents, prefer these over inventing a new mechanism:

- **Blackboard file, not chat state.** A long-running pipeline writes state to a spec file on disk.
  Each worker updates its section before returning; the orchestrator reads the file, not the worker's
  chat output, to decide the next step. Survives context resets and gives a human one artifact to
  inspect at a review gate.
- **Model tiering by role.** `opus` for orchestrators and architects (sequencing, judgment), `sonnet`
  for implementers writing code against a spec, `haiku` for mechanical high-volume work (gate
  runners, validators). It's the biggest lever after tool restriction.
- **Tool restriction encodes authority, not just cost.** An orchestrator without `Edit`/`Write`
  physically cannot bypass its workers.
- **`disable-model-invocation: true` is the human-authority boundary.** Anything that ships, deploys,
  or publishes gets it. State the boundary in the orchestrator's own prompt too, so a human reading
  that prompt sees the same guarantee rather than having to trust the flag.
- **`isolation: worktree` for parallel workers only.** Sequential single-worker steps don't need it.

## Before you open a PR

```bash
npm install
npm run validate   # manifests, schemas, matching plugin lists
npm run eval       # skill/agent discoverability — offline, no API key
```

Both must pass. There is no build step and no other test runner.

Checklist:

- [ ] Both `plugin.json` manifests exist, with the same `name` and component paths
- [ ] `name` is unique, lowercase, kebab-case
- [ ] `description` on the plugin and on every component states the trigger, not just the topic
- [ ] Every rule, skill, command, and agent has valid frontmatter
- [ ] Plugin `README.md` documents what it ships
- [ ] All manifest paths are relative and point at real directories
- [ ] Plugin registered in both marketplace manifests
- [ ] `evals/cases/<plugin-name>.json` covers every skill and agent
- [ ] `npm run validate` and `npm run eval` pass

## Publishing

- **Claude Code** — submit at [platform.claude.com/plugins/submit](https://platform.claude.com/plugins/submit).
- **Cursor** — work through the [official submission checklist](https://cursor.com/docs/reference/plugins#submission-checklist),
  then submit at [cursor.com/marketplace/publish](https://cursor.com/marketplace/publish).

Both require the repo to be public and the validation above to be green.

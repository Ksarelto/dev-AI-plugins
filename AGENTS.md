# AGENTS.md

Operating guide for AI coding agents working in this repo, per the [agents.md](https://agents.md)
convention. It covers what this repo is, how to run it, and the invariants a change must not break.

The **authoring reference** — component types, frontmatter fields, creation flow, naming, submission
checklists — lives in [CONTRIBUTING.md](CONTRIBUTING.md). Read it before adding or editing any rule,
skill, command, or agent. Don't restate its content here.

## What this repo is

A plugin marketplace, not an application. It ships **rules**, **skills**, **commands**, and **agents**
that other people install into Claude Code or Cursor. The deliverable is Markdown and JSON — there is
no source code to build and no runtime to exercise. "Working" means the manifests validate and the
component descriptions are discoverable, which is what the two commands below check.

## Commands

```bash
npm install
npm run validate                 # manifests + schemas + matching plugin lists
npm run eval                     # skill/agent discoverability (offline, no API key)
npm run install:cursor-local     # symlink each plugin into ~/.cursor/plugins/local/<plugin-name>
npm run uninstall:cursor-local   # remove those symlinks
node scripts/install-cursor-local.mjs --dry-run   # preview (add --uninstall to preview removals)
```

There is no build step and no other test runner. **Both `validate` and `eval` must pass before any
change to a plugin, skill, agent, or manifest is done.**

## Repo layout

```
.claude-plugin/marketplace.json   # Claude Code marketplace — source of truth for registered plugins
.cursor-plugin/marketplace.json   # Cursor marketplace — must mirror the Claude entries exactly
README.md                         # user-facing: catalog + install
CONTRIBUTING.md                   # authoring reference: formats, frontmatter, checklists
AGENTS.md                         # this file
CLAUDE.md                         # pointer to this file for Claude Code
schemas/
  marketplace.schema.json         # validates both marketplace manifests
  plugin.schema.json              # validates both plugin manifests
scripts/
  validate-marketplace.mjs        # npm run validate
  install-cursor-local.mjs        # npm run install:cursor-local
evals/
  runner.mjs                      # npm run eval
  cases/<plugin-name>.json        # prompt -> expected skill/agent, one file per plugin
<plugin>/                         # see CONTRIBUTING.md § Anatomy of a plugin
```

## Invariants

Break any of these and the repo is inconsistent even if the tooling stays green:

1. **Every plugin has two manifests** — `.claude-plugin/plugin.json` and `.cursor-plugin/plugin.json`
   — with the same `name` and the same component paths. They are the only intentionally duplicated
   files; rule/skill/agent content is shared, never copied per harness.
2. **Every plugin is registered in both marketplace manifests**, with identical `name` and `source`.
   `validate` fails if the two lists diverge.
3. **Every skill and agent has an eval case.** Adding one, removing one, or editing a `description`
   requires updating `evals/cases/<plugin-name>.json` in the same change.
4. **A component's `description` is a trigger, not a summary.** It's the only text a model sees when
   deciding whether to load the thing.
5. **Plugin list stays in sync across docs** — `README.md`'s table and each plugin's own `README.md`.

## Things that are easy to get wrong here

- `validate` checks manifest *shape* and that each plugin `source` directory exists. It does **not**
  check that the `rules`/`skills`/`agents`/`commands` paths inside a plugin manifest resolve to real
  directories, and it doesn't read component frontmatter at all. Verify those by hand.
- `eval` scores lexical overlap between a prompt and the candidates' name and description — a cheap
  proxy for model selection, not the real thing. Passing it is necessary, not sufficient. See
  [evals/README.md](evals/README.md) for what it does and doesn't catch.
- Both schemas set `additionalProperties: false`. An invented manifest key fails validation; check
  `schemas/*.schema.json` before adding one.
- The GitHub remote is `Ksarelto/dev-cusor-plugins` — the repo name is missing an `r`. That spelling
  is correct in install commands and schema `$id`s. The npm package and marketplace name are
  `dev-cursor-plugins`, spelled normally. Don't "fix" either one.
- `.gitignore` excludes `.claude`, `.cursor`, and `.codemie` (local editor state) but **not**
  `package-lock.json`, which is committed on purpose.

## Related

- [README.md](README.md) — install and use the plugins
- [CONTRIBUTING.md](CONTRIBUTING.md) — component formats, frontmatter, creation flow, submission
- [evals/README.md](evals/README.md) — eval case format and scoring

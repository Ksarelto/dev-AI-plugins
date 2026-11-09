# Prototype Kit

**Create**: `/prototype-kit:init-prototype` → `skills/init-prototype/SKILL.md`  
**Update**: `/prototype-kit:update-prototype` → `skills/update-prototype/SKILL.md`

Builds a living Alpine.js HTML prototype at `prototype/` in the app you are working in.
Init scaffolds the shell and base pages from a plain-text brief. Update edits that same folder
from a change note. `senior-designer` writes the UI and never asks you questions; the skill owns
the review gate.

A colour, font, radius, density, or layout you provide is copied verbatim. [ui-ux-pro-max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill)
fills only what the brief leaves open. Without it, the designer works from first principles and says so.

This kit is a separate marketplace install. It is not a factory stage. After you approve a prototype,
the skill prints the `factory reference add ./prototype --feature <id>` line so the factory can treat
`prototype/` as a binding visual reference.

---

## Install

**Requires**: Node.js (the kit scripts use the standard library only).

**Optional**:

- Python 3 and `ui-ux-pro-max`, for design search. The skill looks for `scripts/search.py` under the usual skill install paths and offers to install the CLI if it is missing.
- Playwright, already importable in the environment, for the browser check. The designer does not install packages. If Playwright is missing, verification is skipped and that is not a failure.

### Claude Code

```text
/plugin install prototype-kit@dev-AI-plugins
```

Local development from this marketplace repo:

```bash
claude --plugin-dir ./prototype-kit
```

### Cursor

From this marketplace repo:

```bash
npm run install:cursor-local
```

Then **Developer: Reload Window** and enable the kit under **Customize → Plugins**.

Cursor loads `cursor-agents/`, which that command writes into the local plugin mirror from `agents/`.
`senior-designer` stays `model: opus` in this repo; the mirror copy uses the Cursor model id in
`scripts/model-tiers.json` (`opus` → `grok-4.7[effort=high]`) and Cursor tool names (`StrReplace`, `Shell`).
Edit `agents/` only.

If a local mirror from an older checkout is already present, the installer refreshes it when this
plugin is missing from the mirror. After later edits in this repo, run
`npm run install:cursor-local -- --sync-source` and reload Cursor.

---

## How to use

**First prototype** — only when `prototype/prototype.json` does not exist yet.

1. `/prototype-kit:init-prototype` with the product, who it is for, and any shell or pages you already know. A brand file, token file, or screenshot path is an extra design source. A Figma URL needs an export saved under `prototype/design/`.
2. Review the REVIEW block. **Approve**, describe a change, or stop.
3. On approve, the folder stays. Serve it with `npx serve prototype` and open http://localhost:3000.

**Existing prototype** — when `prototype/prototype.json` is already there.

1. `/prototype-kit:update-prototype` with what to add or fix.
2. The same review loop. The change note outranks the previous brief for the attributes it names.

Init refuses to overwrite an existing `prototype/prototype.json`. Update refuses to run when that file is missing.

The skill writes `prototype/README.md` in the app (how to serve that prototype). This file is the kit's README.

---

## Directory layout

```
prototype-kit/
  README.md
  .claude-plugin/plugin.json          ← Claude manifest; agents are auto-discovered
  .cursor-plugin/plugin.json          ← Cursor manifest; agents is ./cursor-agents/
  agents/
    senior-designer.md                ← opus | writes prototype/; never asks the user
  skills/
    init-prototype/
    update-prototype/
  scripts/
    collect-design-inputs.mjs         ← binding theme / brand / layout sources
    apply-design-brief.mjs            ← fills css/tokens.css, base.css, components.css from ## Slots
    assemble-prototype.mjs
    qa-prototype.mjs
    verify-prototype.mjs              ← optional Playwright check on port 4599
    write-feature-map.mjs             ← prototype/features.yaml after approval
  templates/                          ← design brief, page shell, CSS, JS
  references/                         ← accessibility, Alpine, ui-ux-pro-max
```

`cursor-agents/` is not in this repo. `npm run install:cursor-local` writes it into
`~/.cursor/plugins/local/.source-repo/prototype-kit/` before linking the plugin.

---

## What it writes

In the app root, not in this kit:

```
prototype/
  brief.md
  prototype.json
  design-inputs.json
  design-brief.md
  css/  js/  pages/  design/
  README.md
  features.yaml          ← after approval
```

There is no spec, no timestamped directory, and no `.factory/` write. The prototype is `prototype/`.

---

## Tests

```bash
node --test prototype-kit/scripts/*.test.mjs
```

---
name: init-prototype
description: Create the living HTML prototype at prototype/ in the app root from a plain-text product brief. Scaffolds css, js, pages, and design folders, then a senior designer builds the shell, header, navigation, and base pages. Use for the first prototype only, when prototype/prototype.json does not exist yet. Do not use to change a prototype that already exists.
argument-hint: "<plain-text product brief>"
allowed-tools: [Read, Write, Bash, Agent, AskUserQuestion, Glob, Grep]
---

# Init prototype

**Invoked as**: `/prototype-kit:init-prototype`
**Writes**: `prototype/` in the app root (the workspace you are working in)
**Edits an existing prototype**: `/prototype-kit:update-prototype` instead

This skill runs in the main conversation. It owns every question. `senior-designer` never asks the user.

## Resolve KIT_DIR

`KIT_DIR` is the plugin root (the directory that contains `agents/` and `scripts/`). Use the first that exists:

1. Parent of this skill folder — `{this SKILL.md directory}/../..`
2. `prototype-kit` relative to the workspace root

Scripts are `{KIT_DIR}/scripts/…`. Templates are `{KIT_DIR}/templates/…`.

## Steps

### 1. Refuse a second init

If `prototype/prototype.json` exists, stop. Tell the user to run `/prototype-kit:update-prototype` with what should change. Do not overwrite the folder.

### 2. Brief

The text after the command is the brief. If it is empty, ask for the product, who it is for, and any shell or pages they already know they want. Do not invent a product.

Write that text unchanged to `prototype/brief.md`. Create `prototype/css`, `prototype/js`, `prototype/pages`, and `prototype/design`.

Any file or directory path the user named (brand guide, tokens, screenshots) is an extra design source. A Figma URL cannot be opened by the designer. If this session can export it, save the export under `prototype/design/` and pass that path. Otherwise say so and ask for an export.

### 3. Resolve ui-ux-pro-max

```bash
python3 --version 2>/dev/null || echo "NO_PYTHON"
for d in "$CLAUDE_PLUGIN_ROOT/.claude/skills/ui-ux-pro-max" ".claude/skills/ui-ux-pro-max" \
         "$HOME/.claude/skills/ui-ux-pro-max" ".cursor/skills/ui-ux-pro-max" \
         "$HOME/.cursor/skills/ui-ux-pro-max" ".agents/skills/ui-ux-pro-max" \
         "$HOME/.agents/skills/ui-ux-pro-max" ".windsurf/skills/ui-ux-pro-max" \
         ".factory/skills/ui-ux-pro-max"; do
  [ -f "$d/scripts/search.py" ] && echo "UIUX_DIR=$d" && break
done
```

If a `UIUX_DIR=` line printed and Python 3 is present, keep that path. Do not ask.

Otherwise ask whether to install `ui-ux-pro-max` (84 styles, palettes, font pairings, UX guidelines). Without it the designer works from first principles and says so.

```bash
if [ -d .cursor ] || [ -n "${CURSOR_PROJECT_DIR:-}" ]; then echo HOST_AI=cursor; else echo HOST_AI=claude; fi
```

- **Install** — `npm install -g ui-ux-pro-max-cli && uipro init --ai {HOST_AI} --global`, then re-run the loop. If a global install is not permitted, `npx -y -p ui-ux-pro-max-cli uipro init --ai {HOST_AI}`. If it still does not resolve, continue with `UIUX_DIR: none`.
- **Continue without it** — `UIUX_DIR: none`.
- **Stop** — stop. Leave any files already written.

If `python3` is missing, say the search script needs Python 3, and continue with `UIUX_DIR: none` or stop. Never invent a `UIUX_DIR`.

### 4. Collect binding design inputs

```bash
node {KIT_DIR}/scripts/collect-design-inputs.mjs \
  --out prototype/design-inputs.json \
  --brief prototype/brief.md \
  [--extra "{path}" ...]
```

Pass one `--extra` per path the user named. `BINDING:` → tell the user, in one line, which sources will be followed, then continue. `NONE:` → continue. The designer picks the open choices.

### 5. Spawn the designer

Spawn `senior-designer` in the foreground and wait. Pass only:

```
MODE: init
KIT_DIR: {resolved plugin root}
OUTPUT_DIR: prototype
UIUX_DIR: {path or none}
DESIGN_INPUTS: prototype/design-inputs.json
BRIEF: prototype/brief.md

Read the brief from BRIEF. Do not ask the user. Return one REVIEW block and stop.
```

If the call errors or returns no REVIEW block, spawn it once more. The files on disk are the checkpoint. If the retry also fails, stop and say the designer failed.

### 6. Review until the user approves or stops

Run QA yourself before you show anything:

```bash
node {KIT_DIR}/scripts/qa-prototype.mjs prototype --pages {comma-separated ids}
```

If it prints any `critical_issues`, do not ask the user. Spawn `senior-designer` with `MODE: revise` and `CHANGE` set to those lines, then run QA again. The share gate includes a viewport-locked shell (only `.main` scrolls), a full-width content column, one text color on every badge, and one border treatment on stat cards in the same row.

1. Show the REVIEW block as the designer returned it.
2. Write `prototype/README.md`:

```markdown
# {title}

Serve: `npx serve prototype`

Open http://localhost:3000

{REVIEW block}
```

3. Ask how to proceed:
   - **Approve** — stop. The prototype stays as it is.
   - **Describe a change** — the user types what to fix.
   - **Stop** — stop. Files stay.

4. On a change, spawn `senior-designer` again with the same paths and:

```
MODE: revise
CHANGE: {the user's note}
```

Show the new REVIEW, rewrite the README, and ask again. Repeat until the user approves or stops. There is no cycle cap.

On **Approve**, write the page map, then print the block below and stop. Do not write `.factory/` and do not call the factory CLI.

```bash
node {KIT_DIR}/scripts/write-feature-map.mjs prototype
```

The script creates `prototype/features.yaml` when it is missing: one entry, slug and intent from the `prototype.json` title, pages from `assembly_pages`. When the file has one entry, it refreshes `pages` and leaves slug, states, and intent. When it has several entries, it does not write; show the page ids it prints so the human edits the matching entry. If the script exits non-zero, show the error and stop. Do not write the file yourself.

```text
## Prototype map
Folder: prototype/ (binding visual reference).
Pages: {ids from prototype.json assembly_pages}.
Layout, states, copy, density, and colour intent: those HTML files, prototype/css/tokens.css, and prototype/design-brief.md.

factory reference add ./prototype --feature <id>
```

`<id>` is the feature id from `/factory:intake` (`FEAT-001` on a new repo). If intake has not run, say to run it first, then the reference command.

There is no spec, no timestamped directory, and no parent-orchestrator result file. The prototype is `prototype/`.

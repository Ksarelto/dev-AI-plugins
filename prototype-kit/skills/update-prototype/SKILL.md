---
name: update-prototype
description: Update the existing living HTML prototype at prototype/ from a plain-text change request. Adds a page, restyles, or fixes copy and layout in the folder that already has prototype.json. Use when that file exists. Do not use to scaffold a prototype that is not there yet.
argument-hint: "<what to add or change>"
allowed-tools: [Read, Write, Bash, Agent, AskUserQuestion, Glob, Grep]
---

# Update prototype

**Invoked as**: `/prototype-kit:update-prototype`
**Edits**: `prototype/` in the app root, in place
**No prototype yet**: `/prototype-kit:init-prototype` instead

This skill runs in the main conversation. It owns every question. `senior-designer` never asks the user.

## Resolve KIT_DIR

`KIT_DIR` is the plugin root (the directory that contains `agents/` and `scripts/`). Use the first that exists:

1. Parent of this skill folder — `{this SKILL.md directory}/../..`
2. `prototype-kit` relative to the workspace root

## Steps

### 1. Require an existing prototype

If `prototype/prototype.json` is missing, stop. Tell the user to run `/prototype-kit:init-prototype` with a product brief first.

### 2. Change note

The text after the command is the change. If it is empty, ask what to add or fix. Do not invent a change.

Any file or directory path the user named is an extra design source. A Figma URL cannot be opened by the designer. If this session can export it, save the export under `prototype/design/` and pass that path. Otherwise say so and ask for an export.

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

Otherwise ask whether to install `ui-ux-pro-max`. Without it a restyle uses first principles and the designer says so.

```bash
if [ -d .cursor ] || [ -n "${CURSOR_PROJECT_DIR:-}" ]; then echo HOST_AI=cursor; else echo HOST_AI=claude; fi
```

- **Install** — `npm install -g ui-ux-pro-max-cli && uipro init --ai {HOST_AI} --global`, then re-run the loop. If a global install is not permitted, `npx -y -p ui-ux-pro-max-cli uipro init --ai {HOST_AI}`. If it still does not resolve, continue with `UIUX_DIR: none`.
- **Continue without it** — `UIUX_DIR: none`.
- **Stop** — stop. Leave the prototype as it is.

If `python3` is missing, say the search script needs Python 3, and continue with `UIUX_DIR: none` or stop. Never invent a `UIUX_DIR`.

### 4. Collect binding design inputs

Re-scan so a new brand file is seen. The existing brief stays a source.

```bash
node {KIT_DIR}/scripts/collect-design-inputs.mjs \
  --out prototype/design-inputs.json \
  --brief prototype/brief.md \
  [--extra "{path}" ...]
```

`BINDING:` → one line naming the sources, then continue. `NONE:` → continue. The change note itself outranks those sources for the attributes it names. The designer enforces that. Do not rewrite `prototype/brief.md`.

### 5. Spawn the designer

Spawn `senior-designer` in the foreground and wait. Pass only:

```
MODE: update
KIT_DIR: {resolved plugin root}
OUTPUT_DIR: prototype
UIUX_DIR: {path or none}
DESIGN_INPUTS: prototype/design-inputs.json
CHANGE: {the user's change note}

Edit prototype/ in place. Touch only the files the note requires. Do not ask the user. Return one REVIEW block and stop.
```

If the call errors or returns no REVIEW block, spawn it once more. If the retry also fails, stop and say the designer failed. The existing prototype stays.

### 6. Review until the user approves or stops

Run QA yourself before you show anything:

```bash
node {KIT_DIR}/scripts/qa-prototype.mjs prototype --pages {comma-separated ids}
```

If it prints any `critical_issues`, do not ask the user. Spawn `senior-designer` with `MODE: revise` and `CHANGE` set to those lines, then run QA again. The share gate includes a viewport-locked shell (only `.main` scrolls), a full-width content column, one text color on every badge, and one border treatment on stat cards in the same row.

1. Show the REVIEW block as the designer returned it.
2. Rewrite `prototype/README.md`:

```markdown
# {title from prototype.json}

Serve: `npx serve prototype`

Open http://localhost:3000

{REVIEW block}
```

3. Ask how to proceed:
   - **Approve** — stop.
   - **Describe a change** — the user types the next fix.
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
Pages: {ids this change touched}.
Layout, states, copy, density, and colour intent: those HTML files, prototype/css/tokens.css, and prototype/design-brief.md.

factory reference add ./prototype --feature <id>
```

`<id>` is the open feature. A new feature needs its own `reference add` even when an earlier feature already confirmed `./prototype`. If intake has not run, say to run it first.

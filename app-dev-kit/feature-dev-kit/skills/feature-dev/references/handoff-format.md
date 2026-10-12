# Handoff Format

Every build-station return (shared, entities, features, slice, composition, app, test) uses `board.mjs handoff`. Analysts, the architecture auditor, and the code reviewer return a short handoff file of their own; they do not use this command.

```bash
node {KIT_DIR}/skills/feature-dev/scripts/board.mjs handoff .spec/features/<slug>.md \
  --name <agent>-<station> \
  --outcome "<one line>" \
  --paths <comma-separated files> \
  --decisions "<one line>" \
  --gates "<gate: pass|fail>"
```

Rules:
- The command rejects files longer than 15 lines.
- It also rejects a `fail` in `--gates` unless `--outcome` starts with `blocked:`. A red self-check is fixed before the handoff. When the fix is outside `BOUNDARY` (a lower layer is missing a hook, export, or type you need), mark the row `blocked` with `board.mjs row … --status blocked --note "<what is missing>"` and pass `--outcome "blocked: <name> missing in <layer>/<slice>"`.
- Never copy gate output or the Build Plan note.
- Return to the orchestrator:

```
HANDOFF: <that path>
CONTAINS: <one line>
```

- If this context is near its limit, refresh that file and continue from it. Do not paste file bodies, diffs, or command output into the return.

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
- Never copy gate output or the Build Plan note.
- Return to the orchestrator:

```
HANDOFF: <that path>
CONTAINS: <one line>
```

- If this context is near its limit, refresh that file and continue from it. Do not paste file bodies, diffs, or command output into the return.

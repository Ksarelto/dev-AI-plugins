# Pipeline Flow — backend-dev-kit

**CANONICAL.** Skill owns 0.5, 1b, 12. Hub never calls `AskUserQuestion`.

```
── backend-dev skill ──
Station 0    import-upstream + backend-interpreter + backend-analyst
Station 0.5  🧑 contract / AC gate
  ⇢ spawn backend-orchestrator (MODE: build)

── backend-orchestrator ──
Station 1    discovery (compose.ts, tables)
Station 1b   ⇢ DEP_PACKET if new packages
Station 2    build-plan: table → zod → repo → service → router → compose → openapi
Station 3    implement (scaffold-service if needed, then api-implementer)
Station 4    tests (test-writer)
Station 5    gates (quality-gate-runner)
Station 6    auto-review (code-reviewer)
Station 7    fix loop (max 3 per gate)
  ⇢ REVIEW_PACKET or ESCALATION_PACKET

── backend-dev skill ──
Station 12   🧑 human review → write-kit-result
```

One `/backend-dev` run = **one resource**. Gate bypass is never allowed.
`revise` re-enters at the lowest failed station.

## Loop guards

| Loop | Max | On exceed |
|------|-----|-----------|
| Clarification | 3 | remaining unknowns → Decisions |
| Fix per gate | 3 | ESCALATION_PACKET |
| Auto-review | 2 | ESCALATION_PACKET |
| Human review | 3 | accept-as-is / abort |

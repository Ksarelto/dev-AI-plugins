# Packets — backend-dev-kit

Subagents return exactly one packet and STOP. The skill presents it.

| `type` | Who | Skill does |
|--------|-----|------------|
| `CLARIFY_PACKET` | `backend-analyst` | Ask; write `## Clarifications` |
| `DEP_PACKET` | hub | Approve / reject / abort per package |
| `REVIEW_PACKET` | hub | Station 12 |
| `ESCALATION_PACKET` | hub | Ask with `errors[]` |

Do not invent a fifth type. `spec_path` is the backend blackboard.

## CLARIFY_PACKET

```json
{
  "type": "CLARIFY_PACKET",
  "spec_path": ".spec/backend/<slug>.md",
  "round": 1,
  "questions": ["…"],
  "status": "awaiting-clarification"
}
```

## DEP_PACKET

```json
{
  "type": "DEP_PACKET",
  "spec_path": ".spec/backend/<slug>.md",
  "packages": [
    {
      "name": "",
      "version": "",
      "size": "",
      "license": "",
      "why": "",
      "alternatives": []
    }
  ]
}
```

## REVIEW_PACKET

```json
{
  "type": "REVIEW_PACKET",
  "spec_path": ".spec/backend/<slug>.md",
  "slug": "<slug>",
  "branch": "backend/<slug>",
  "review_path": ".spec/backend/<slug>.context/backend-orchestrator-review.md"
}
```

## ESCALATION_PACKET

```json
{
  "type": "ESCALATION_PACKET",
  "spec_path": ".spec/backend/<slug>.md",
  "station": "0",
  "errors": ["…"],
  "options": ["retry", "proceed-with-risk", "abort"]
}
```

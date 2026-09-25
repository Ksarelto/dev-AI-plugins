# Packets — agent-dev-kit

`CLARIFY_PACKET`, `DEP_PACKET`, `REVIEW_PACKET`, `ESCALATION_PACKET`. `spec_path` is the agent blackboard.

## CLARIFY_PACKET

```json
{
  "type": "CLARIFY_PACKET",
  "spec_path": ".spec/agents/<slug>.md",
  "round": 1,
  "questions": ["…"],
  "status": "awaiting-clarification"
}
```

## DEP_PACKET

```json
{
  "type": "DEP_PACKET",
  "spec_path": ".spec/agents/<slug>.md",
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
  "spec_path": ".spec/agents/<slug>.md",
  "slug": "<slug>",
  "branch": "agent/<slug>",
  "review_path": ".spec/agents/<slug>.context/agent-dev-orchestrator-review.md"
}
```

## ESCALATION_PACKET

```json
{
  "type": "ESCALATION_PACKET",
  "spec_path": ".spec/agents/<slug>.md",
  "station": "0",
  "errors": ["…"],
  "options": ["retry", "proceed-with-risk", "abort"]
}
```

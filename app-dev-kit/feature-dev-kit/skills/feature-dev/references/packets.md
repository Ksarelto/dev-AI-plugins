# Packets — feature-dev-kit

Hub-and-spoke return values. Subagents **never** call `AskUserQuestion`. They return exactly
one packet JSON object and STOP. The `feature-dev` skill (main conversation) presents the
packet and asks the human.

Golden fixtures: `../templates/packets/*.json`.

---

## Envelope

Every packet has `type` and `spec_path`. Extra fields depend on the type.

| `type` | Returned by | Skill does |
|--------|-------------|------------|
| `CLARIFY_PACKET` | `spec-analyst` (Station 0) | `AskUserQuestion` with `questions[]`; write answers into `## Clarifications`; re-spawn analyst |
| `DEP_PACKET` | `feature-orchestrator` (Station 1b) | Per-package Approve / Reject-alternative / Abort; write verdicts; re-spawn `MODE: build` from Station 2 |
| `REVIEW_PACKET` | `feature-orchestrator` (end of 11) | Present `review_packet`; Approve / Request changes / Abort (Station 12) |
| `ESCALATION_PACKET` | `feature-orchestrator` or a spoke that cannot proceed | `AskUserQuestion` with `errors[]` and `options[]` |

Do not continue past a packet. Do not invent a fifth type.

---

## CLARIFY_PACKET

```json
{
  "type": "CLARIFY_PACKET",
  "spec_path": ".spec/features/<slug>.md",
  "round": 1,
  "questions": ["…"],
  "status": "awaiting-clarification"
}
```

`questions` is a batched list (not one-at-a-time). Empty `questions` means intake is complete
and the skill may run Station 0.5 — the analyst still must **not** set `status: approved`.

---

## DEP_PACKET

```json
{
  "type": "DEP_PACKET",
  "spec_path": ".spec/features/<slug>.md",
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

Returned only when `## Dependencies` has rows still `awaiting-human-approval`.

---

## REVIEW_PACKET

```json
{
  "type": "REVIEW_PACKET",
  "spec_path": ".spec/features/<slug>.md",
  "slug": "<slug>",
  "branch": "feature/<slug>",
  "review_packet": ""
}
```

`review_packet` is the markdown in `../templates/review-packet.md`. Also append it to
`## Human Review` on the blackboard before returning.

---

## ESCALATION_PACKET

```json
{
  "type": "ESCALATION_PACKET",
  "spec_path": ".spec/features/<slug>.md",
  "station": "1.5",
  "errors": ["…"],
  "options": ["retry", "proceed-with-risk", "abort"]
}
```

Use for: `architecture-auditor` or companion skill missing, baseline hard violations on files
this feature will touch, gate still red after 3 fix attempts, empty FSD tree when a host app is
required.

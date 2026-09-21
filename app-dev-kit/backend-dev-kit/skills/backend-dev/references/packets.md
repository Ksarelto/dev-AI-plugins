# Packets — backend-dev-kit

Subagents return exactly one packet and STOP. The skill presents it.

| `type` | Who | Skill does |
|--------|-----|------------|
| `CLARIFY_PACKET` | `backend-analyst` | Ask; write `## Clarifications` |
| `DEP_PACKET` | hub | Approve / reject / abort per package |
| `REVIEW_PACKET` | hub | Station 12 |
| `ESCALATION_PACKET` | hub | Ask with `errors[]` |

Do not invent a fifth type. Shapes match feature-dev-kit `packets.md` (`spec_path` = blackboard).

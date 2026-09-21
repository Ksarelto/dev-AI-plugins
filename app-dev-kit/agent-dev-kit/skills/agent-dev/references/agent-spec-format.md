# Agent spec format (blackboard)

Path: `.spec/agents/<slug>.md`.

Front matter: `slug`, `status`, `branch: agent/<slug>`, `upstream-spec`, `task-id`,
`agent-ref`, `prototype-ref`.

Sections: Request, Clarifications, Acceptance Criteria, Agent Contract (kind/runtime/embed/tools/KBs),
Architecture (agent-architect), Dependencies, Build Plan, Eval Plan, Gate Log, Human Review,
Decisions.

Hub writes only this file.

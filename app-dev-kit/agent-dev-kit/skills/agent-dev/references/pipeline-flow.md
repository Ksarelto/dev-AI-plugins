# Pipeline Flow — agent-dev-kit

Skill owns 0.5, 1b, 12. Hub never calls `AskUserQuestion`.

```
Station 0    import-upstream + agent-interpreter + agent-analyst
Station 0.5  🧑 agent-contract gate
  ⇢ agent-dev-orchestrator MODE: build
Station 1    agent-architect → ## Architecture
Station 1b   DEP_PACKET
Station 2    plan (runtime, tools, embed, eval)
Station 3    scaffold-agent or embed-agent
Station 4    tools + agent-builder or langgraph-agent
Station 5    rag-builder if knowledge-bases
Station 6    agent-eval goldens
Station 7    gates + review + fix
Station 12   🧑 human review → write-kit-result
```

One run = one `agent-surface.agents[]` row (or one heuristic agent).
If `embed: backend-route` and `create-app.ts` is missing → STOP (error envelope).

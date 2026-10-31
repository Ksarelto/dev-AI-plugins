---
name: ai-implement-task
description: Procedure for the factory AI-agent builder — build a node or tool with injected models and retrievers, register tools in the agent's registry, Zod-validated read-only tools, interrupt() before any write, prompts in prompts.ts, loop limits; done when red tests, eval thresholds and static checks pass. Preloaded by ai-builder; not for direct use.
user-invocable: false
---

# Implement one AI-agent task (green phase)

## Before writing

Read the red tests, then `03-architecture/agent-design.md` for the node, tool or state this task
implements, then the stack skill and golden file in T0.

## Rules

- Models, embeddings, retrievers, clocks and loggers are injected through factories and created in
  the composition root; nothing reads `process.env` or constructs a client inside a node or tool.
- A tool validates its input with Zod, returns text the model can act on (including a helpful
  message on bad input), and is read-only unless the design says otherwise — a writing tool asks for
  confirmation with `interrupt()` first.
- Prompts live next to the agent (`prompts.ts`); change them only when the task says so.
- Register a new tool in the agent's tool registry and describe it for the model in one sentence.
- Keep the graph's loop limit and guardrails on every path.

## Exit

Run the exit check (`gate impl`): red tests unchanged and green, the unit suite green, typecheck,
lint, layer rules and build clean, and — for model-facing task types — the eval run (`eval`) passes
its thresholds. Evals need the model provider's key; if they are skipped because it is missing, the
gate says so: report it in your summary, never weaken a case or a threshold.

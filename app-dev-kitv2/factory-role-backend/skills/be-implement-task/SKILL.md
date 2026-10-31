---
name: be-implement-task
description: Procedure for the factory backend builder — routes map paths, controllers parse with Zod and call one service, services hold the rules, only repositories touch Drizzle, dependencies are wired in the composition root and errors leave as problem+json. Preloaded by be-builder; not for direct use.
user-invocable: false
---

# Implement one backend task (green phase)

## Before writing

1. The red tests are the specification; read them first, then the stack skill and golden file in
   T0 ("Procedure", "Golden file").
2. Check `03-architecture/api-contract.yaml` for the agreed paths, bodies and error codes. The
   OpenAPI document (`src/openapi/document.ts`) must describe what you build — the auditor compares
   the two.

## Layer rules

- A route only maps a path to a controller handler; a controller parses input with the Zod schema,
  calls one service function and shapes the response; a service holds the rules and talks to
  repositories through interfaces; only repositories touch Drizzle.
- New dependencies are created in the composition root (`src/container.ts`) and passed down — no
  module-level singletons, no imports upward. The dependency-cruiser rules fail the gate otherwise.
- Errors are thrown as the stack's typed errors and mapped to problem+json by the error handler;
  never `res.status(500).send(...)` by hand.
- Configuration comes from the validated env schema, never `process.env` in a handler.

## Writing

Smallest change that turns the tests green, then tidy while they stay green. No new packages, no
speculative options, no schema changes (a migration is a separate task type).

## Exit

Run the exit check (`gate impl`): red tests unchanged, the unit suite green, typecheck, lint
(ESLint + dependency-cruiser) and build clean. On a retry, fix only what T3 lists. A wrong red test
is disputed with `"test_dispute": { "test": "<file>", "reason": "…" }`, never edited.

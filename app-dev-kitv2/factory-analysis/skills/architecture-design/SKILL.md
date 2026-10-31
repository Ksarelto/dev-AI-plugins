---
name: architecture-design
description: Procedure for the factory solution-architect — place a feature inside the stack's reference architecture as a component map with reuse decisions and ADRs, or write the app profile when bootstrapping a new app. Preloaded by the solution-architect; not for direct use.
user-invocable: false
---

# Architecture design

## Bootstrap (stage `bootstrap`, new app)

Write `.factory/app-profile.yaml` ([fa-app-profile.yaml](../../templates/fa-app-profile.yaml)) from
the normalised sources and `factory.config.yaml`: name, goal, scope and out-of-scope from the
sources; `components` from the enabled roles and their stacks; NFRs only when a source states them;
`origin: greenfield`, `conformance: conformant`.

## Component map (stage `architecture`)

Write `03-architecture/component-map.md`
([fa-component-map.md](../../templates/fa-component-map.md)).

1. Read the stories, UX notes and the capability map. The pack names the stack; its
   `reference_architecture` (layers and import rules) is binding.
2. For each story, list the components that deliver it, with `path` and `layer`. Every story needs
   at least one component; every component names its stories.
3. Reuse first. For each component set `reuse`:
   - `existing`: an existing component is used as is;
   - `extend`: an existing component gains behaviour (no fork, no copy);
   - `new`: nothing fits — `reuse_considered` lists what you checked and `reuse_rejected` says why.
4. `contract_ops` lists the API operations the feature needs (by `operationId`); the
   contract-steward defines them next.

## Decisions (ADRs)

Write an ADR for each decision a later reader would question: a new shared component, a state
location, a deviation from the reference architecture, a data-shape choice. One file per decision,
`03-architecture/adr-NNN-<slug>.md` ([fa-adr-example.md](../../templates/fa-adr-example.md)), and cite
its ID in `decisions`. A deviation from the reference architecture without an ADR fails review.

Run the exit check from T0 before you return.

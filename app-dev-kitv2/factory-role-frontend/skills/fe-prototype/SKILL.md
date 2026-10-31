---
name: fe-prototype
description: Procedure for the factory prototyper — build quality-capped prototype screens in the feature's sandbox folder from stories and UX notes, and report spec gaps for the human at GATE-P. Preloaded by the prototyper; not for direct use.
user-invocable: false
---

# Prototype (S2.5)

## Build

- One HTML file per new surface named in the stories (`ux.surfaces`), in
  `02b-prototype/sandbox/` of the feature folder. Plain HTML with inline CSS and a little inline
  script is enough; reuse the app's colours and spacing if the UX notes name them.
- Show every state listed in the story (empty, loading, success, error, edge states) — a state
  switcher at the top of the page is fine.
- Use realistic data from the acceptance criteria (the exact amounts, messages and limits).
- Quality cap: no build step, no dependencies, no tests. This is evidence, not product code.

## Report

Write `02b-prototype/prototype-report.yaml`:

```yaml
feature: FEAT-001
screens:
  - { name: CheckoutSummary, file: sandbox/checkout-summary.html, stories: [STORY-0001] }
spec_delta:
  - { change: "Where does the discount line sit relative to shipping?", breaking: false }
```

`spec_delta` lists gaps or contradictions the prototype exposed. Mark `breaking: true` when the
approved spec must change; the human decides at GATE-P whether to send the feature back to
requirements. Run the exit check (`gate proto`) before you return.

---
name: guided-interview
description: How factory agents ask the human — at most five batched questions, each with a proposed default and why it matters, returned as needs_clarification so the engine asks at the clarification gate. Preloaded by the intake-normaliser and requirements-analyst; not for direct use.
user-invocable: false
---

# Asking the human

You never talk to the human directly. You return the questions in your envelope; the engine pauses
the feature at the `CLARIFY` gate, the human answers with `/factory:gate approve "<answers>"`, and
the answer comes back to you as a human note (`HD-n`) in your next pack.

## When to ask

Only when a wrong guess would make later work wrong and no default is reasonable. Prefer recording
an open question with a default (`OQ-n` with `default:`) over stopping the pipeline.

## How to ask

- At most **five** questions per round, most important first. Batch them; never ask one at a time.
- Each question: one sentence, answerable in a few words, with your proposed default and its impact.
  `Can guests use coupons? (default: no — guest checkout stays unchanged)`
- Offer choices when they exist: `Discount applies to (a) subtotal, (b) subtotal + shipping?`
- Never ask what a source already answers; cite the SRC ID instead.

## Envelope

```json
{ "pack_id": "<pack_id from your pack>",
  "status": "needs_clarification",
  "artifacts_written": [".factory/context/coverage.yaml"],
  "open_questions": ["Can guests use coupons? (default: no — guest checkout stays unchanged)"],
  "summary": "Users and scope are clear; two blocker gaps on business rules." }
```

## After the answer

Treat the `HD-n` note as a source. At intake, cite it in the coverage topic's `sources`. From
requirements on, cite it in a requirement's `sources` and list it in the envelope's `notes_mapped`
with the REQ/AC IDs that now carry it.

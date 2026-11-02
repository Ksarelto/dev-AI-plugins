---
name: normalise-intake
description: Procedure for the factory intake-normaliser — describe non-text sources paragraph by paragraph with new source IDs and rate intake coverage per topic. Preloaded by the intake-normaliser; not for direct use.
user-invocable: false
---

# Normalise intake

Runs on: intake-normaliser (haiku) — faithful transcription of screenshots and documents plus an
honest seven-topic checklist; no interpretation.

The engine has already split every text source into tagged paragraphs (`[SRC-012] …`) in
`.factory/context/normalised/`. Your work is what a script cannot do: describe images, PDFs and other
files, then rate coverage. Detailed rules with examples:
[fa-intake-rules.md](references/fa-intake-rules.md).

## 1. Find what needs describing

Open `context/index.yaml` (T2). A source with `kind: image`, `pdf` or `other` whose normalised file
still holds only `<!-- … -->` is a placeholder. Text sources (`kind: text`, with a `normalised_sha`)
are finished: **never edit them** — the gate compares a hash (`edited-source`).

## 2. Describe each placeholder source

Open the original (`file` in the index, under `.factory/inbox/`) and replace the placeholder line:

1. Keep the engine's first heading line. Keep the document's own section headings as Markdown
   headings on their own line.
2. Write one paragraph per fact a requirement could depend on: a table **row**, a list **item**, a
   prose paragraph with a signal word (must, shall, should, cannot, never, always, at most, at
   least, required, not allowed, notify, expire, retain…), a screen region, a form field, a flow
   step, a shown state.
3. Start each paragraph with a new ID `[SRC-nnn]`, continuing after the highest SRC ID in the index.
4. Quote visible text exactly in double quotes. Keep every number verbatim with its unit. Describe
   layout in plain words. Never guess behaviour, numbers or rules the source does not show.
5. Separate paragraphs with one blank line; no blank line inside a paragraph.
6. Add the new IDs, in order, to that source's `ids` list in `context/index.yaml`. Change nothing
   else in the index.

```
[SRC-045] Below the cart lines: a text field labelled "Coupon code" and an "Apply" button to its right.
```

## 3. Rate coverage

Write `.factory/context/coverage.yaml` ([fa-coverage.yaml](../../templates/fa-coverage.yaml)) with
one entry per topic in `intake.coverage_topics` — by default `users`, `goals`, `scope`, `data`,
`rules`, `nfr`, `acceptance`. Read every normalised source of the request (text and described) and
the human notes first.

| Status | Use when | Must carry |
|---|---|---|
| `covered` | a source paragraph or human note answers the topic | `sources: [SRC-…, HD-…]` |
| `gap` | missing or only partly answered, and a default can be proposed | `note:` what is missing |
| `blocker_gap` | missing and nothing sensible can be assumed | `note:` the question you ask |
| `not_applicable` | the topic genuinely does not apply | `note:` why |

Honesty rules:

- Covered means **answered**, not mentioned: "it should be fast" leaves `nfr` a `gap`.
- A partly answered topic is a `gap`; the note names the part that is missing.
- `users` and `goals` are essential: `covered` with a source or `blocker_gap` — never a plain `gap`
  (a patch-tier change is exempt).
- Every cited ID must exist in the index or in a feature's `human-notes.yaml`.

## 4. Ask when you must

A `blocker_gap` fails the gate on purpose: it sends the run to the human. Follow `guided-interview`:
one batch, at most 5 questions in round 1, each with a recommended option and a default. Write
`coverage.yaml` first, then return `needs_clarification`. When the answer arrives as `HD-n`, cite it in
the topic's `sources` and set the topic to `covered`.

## What the intake gate checks

| Rule | Failure |
|---|---|
| `context/index.yaml` exists and is schema-valid | `source-index`, `schema` |
| every normalised file exists | `missing-file` |
| engine-tagged text unchanged | `edited-source` |
| no placeholder left | `placeholder` |
| every paragraph (also under a heading) starts with `[SRC-nnn]` | `untagged-paragraph` |
| no SRC ID used twice | `duplicate-id` |
| the index lists exactly the IDs in each file | `unlisted-id`, `phantom-id` |
| `coverage.yaml` exists, is valid, has every configured topic | `topic-missing` |
| `covered` cites a source; `gap` / `not_applicable` has a note | `covered-without-source`, `gap-without-note` |
| essential topics are `covered` or `blocker_gap` | `essential-gap` |
| no `blocker_gap` left | `blocker-gap` — ask the human |
| every cited SRC / HD exists | `unknown-source` |

## 5. Exit

Run the exit check from T0. `blocker-gap` means "ask"; every other failure is yours to fix before you
return `done`.

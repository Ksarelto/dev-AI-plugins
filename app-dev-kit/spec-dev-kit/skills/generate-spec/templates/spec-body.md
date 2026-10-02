# Spec Body Template (Markdown) — schema 2.0
# Used by: spec-synthesizer — append this below the YAML front matter.
# Replace ALL {{PLACEHOLDER}} values.
#
# The body holds ONLY narrative that cannot live in YAML. It never restates YAML items:
# no data-model, API, screen, coverage, assumption, or out-of-scope lists. Refer to ids instead
# (US-003, BR-002, DEC-001). Tables for humans are generated into spec.views.md by
# scripts/render-spec-views.mjs; validate-spec.mjs rejects hand-written copies (BODY_DUPLICATES_YAML).

---

# {{Human-Readable Title}}

## Problem Context

{{2–4 paragraphs: the situation today, who is hurt and how, the current workaround, why now.
Concrete, in the source's terms. No generic "improve the experience" lines.}}

---

## Solution Overview

{{1–2 paragraphs: what people can do afterwards and the main flow end to end. Business level —
no implementation detail. Name the delivery slices in order (SL-001 … ) in one sentence.}}

---

## User Flows

{{One flow per must story or per closely related story group. Steps reference ids so build agents
can jump to the contract: "(AC-004)", "(BR-001)", "(NTF-002)". Include the error / edge paths
the ACs define — do not invent new behaviour here.}}

### Flow 1: {{Title}} (US-001)

**Actor**: {{Role name}}
**Precondition**: {{starting state}}

**Happy path**
1. {{User action}}
2. {{System response (AC-001)}}
3. {{…}}

**Error path — {{scenario}}** (AC-002, BR-001)
1. {{Steps up to the failure}}
2. {{What the person sees — quote the copy from the AC or BR}}
3. {{Recovery the person has}}

---

## Design Rationale

{{Only decisions with real trade-offs. One subsection per DEC id: the question, the options, the
choice and why. The decision record itself lives in traceability.decisions[]; this is the story
behind it, not a copy.}}

### {{Decision topic}} (DEC-001)

{{Narrative.}}

---

## Implementation Notes

{{Optional. Cross-cutting guidance a build agent needs that is not a requirement, rule, or slice
step — e.g. "all times are building-local civil time; store UTC, render with weekday". Keep to a
short list. Delete the section if empty.}}

---

## Schema History

| Version | Date | Change |
|---------|------|--------|
| 2.0 | {{YYYY-MM-DD}} | Initial spec |

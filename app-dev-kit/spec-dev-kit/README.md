# Spec Dev Kit

**Entry point**: `/generate-spec [feature-name]` → `skills/generate-spec/SKILL.md`

Transforms raw requirements in `.spec/context/` into a validated, approved hybrid YAML+Markdown
spec in `.spec/app/spec-{timecode}_{slug}/spec.md`. The spec is read by downstream kits:
`/generate-html`, `/backend-dev`, `/agent-dev`, `/feature-dev`, and the orchestrators.

Human gates (`AskUserQuestion`) are owned by the **skill**. The orchestrator is a subagent and
returns packets (`CLARIFY_PACKET`, `REVIEW_PACKET`, `ESCALATION_PACKET`, `READY_TO_PUBLISH`).

---

## Install

### Claude Code

```text
/plugin install spec-dev-kit@dev-cursor-plugins
```

Local development from this marketplace repo:

```bash
claude --plugin-dir ./app-dev-kit/spec-dev-kit
```

### Cursor

From this marketplace repo:

```bash
npm run install:cursor-local
```

Then **Developer: Reload Window** and enable the kit under **Customize → Plugins**.

Or add the marketplace in Agent chat:

```text
/add-plugin https://github.com/Ksarelto/dev-cursor-plugins
```

---

## How to use

1. Drop one or more `.md` files into `.spec/context/` (feature request, notes, meeting summary…).
2. Run `/generate-spec` (or `/generate-spec my-feature-name`).
3. Answer clarification questions as prompted (skill-owned).
4. Approve the spec at the review gate (skill-owned).
5. The spec is published to `.spec/app/spec-{timecode}_{slug}/spec.md`.

---

## Directory layout

```
spec-dev-kit/                              ← plugin root (KIT_DIR)
  README.md
  spec-analysis.md                         ← historical (2026-07); see repo-root ANALYSIS.md
  agents/
    spec-orchestrator.md                   ← opus | returns packets; no AskUserQuestion; no Write
    spec-analyst.md                        ← sonnet xhigh | writes artifacts/analysis.json
    spec-interrogator.md                   ← sonnet xhigh | questions[] packet; never asks
    spec-enricher.md                       ← sonnet xhigh | writes artifacts/enriched.json
    spec-completeness.md                   ← haiku | writes artifacts/completeness.json
    spec-synthesizer.md                    ← sonnet xhigh | writes spec.md (status: reviewing)
    spec-review-facilitator.md             ← sonnet | REVIEW_PACKET; apply-pass edits spec.md
    spec-diagram.md                        ← sonnet | Mermaid into ## Visual Reference
  skills/
    generate-spec/
      SKILL.md                             ← entry point; owns HITL + Station 0/1/10
      references/
        pipeline-flow.md                   ← CANONICAL station map
        spec-schema.md
        completeness-checklist.md
        clarification-protocol.md
        context-protocol.md
        artifact-naming.md
        context-budget.md
      templates/
        spec-frontmatter.yaml
        spec-body.md
      scripts/
        validate-spec.mjs
        new-run.sh
```

`KIT_DIR` is the plugin root (this directory when installed). Scripts are
`{KIT_DIR}/skills/generate-spec/scripts/…`. A consumer copy at `.spec/spec-dev-kit/` is a fallback,
not the only path.

---

## Pipeline overview

```
.spec/context/*.md
      │
      ▼ Station 0–1: skill (naming + intake.json)
      ▼ Station 2/2a/2b: analyst + interrogator; skill asks on CLARIFY_PACKET
      ▼ Station 3: pre-enrich gate (orchestrator)
      ▼ Station 4: enricher → enriched.json
      ▼ Station 5: completeness; may CLARIFY_PACKET again
      ▼ Station 6: synthesizer → spec.md (reviewing)
      ▼ Station 7: validate-spec.mjs
      ▼ Station 8: diagrams
      ▼ Station 9: review — HARD STOP (skill asks)
      ▼ Station 10: skill sets status: approved
      │
      ▼ .spec/app/spec-{timecode}_{slug}/spec.md
```

Canonical contracts: `skills/generate-spec/references/pipeline-flow.md`.

---

## Loop guards summary

| Loop | Max rounds | Exit condition | On exceed |
|------|-----------|----------------|-----------|
| Clarification | 3 | `gap_score ≤ 25` AND no conflicts | Remaining gaps → `assumptions[]` |
| Completeness | 3 | `completeness_score ≥ 85` | Uncovered categories → `open-questions[]` |
| Synthesis correction | 2 | `validate-spec.mjs` exits 0 | `ESCALATION_PACKET` to the skill |
| Review | 3 | User explicit approval | Escalate: approve-as-is / drop / replace |

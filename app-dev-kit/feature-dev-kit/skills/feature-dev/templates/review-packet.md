# Template — Review Packet

Returned by `feature-orchestrator` at the end of Station 11 and presented verbatim by the
`feature-dev` skill at Station 12. It must fit on one screen: the human decides fast, then asks for
detail on demand.

```markdown
## Feature Review: ⟨feature-slug⟩

**Spec**:   .spec/features/⟨slug⟩.md
**Branch**: ⟨feature/IV-1423-decline-profile⟩ (base: ⟨develop⟩)
**Status**: awaiting-human

### What was built
⟨2–3 sentences, plain language, from the spec's Request + what the build actually produced.
 Name any place the implementation deviates from the request and why.⟩

### Acceptance criteria
| # | Criterion | Status | Verified by |
|---|-----------|--------|-------------|
| 1 | ⟨criterion⟩ | ✅ met | ⟨test file or manual check⟩ |
| 2 | ⟨criterion⟩ | ⚠️ partial | ⟨what is missing and why⟩ |

### FSD impact
| Layer | Slices | New / Modified |
|-------|--------|----------------|
| shared | ui/Textarea, ui/Dialog | new (shadcn registry) |
| entities | profile | modified — api, model |
| features | decline-profile | new |
| widgets | profile-review-panel | modified |
| pages | profile-review | modified |
| app | routes | modified |

### Gate log
| Gate | Result | Note |
|------|--------|------|
| typecheck | ✅ | — |
| lint | ✅ | — |
| fsd-boundaries | ✅ | — |
| build | ✅ | — |
| coverage | ✅ | branches 79% / functions 84% / lines 91% / statements 90% |
| architecture-audit | ✅ | 0 hard / N judgment (see spec § Architecture Baseline + Human review) |
| auto-review | ✅ | 2 [MINOR] accepted — see spec § Human review |

### Dependencies added
| Package | Version | Approved at |
|---------|---------|-------------|
| ⟨none⟩ | | |

### Diff
⟨output of: git diff --stat ⟨base⟩...HEAD — the stat only, never the diff body⟩

### Open items for you
- ⟨assumption the pipeline made that the human should confirm⟩
- ⟨anything routed to Decisions & open questions⟩

**Decision required**: `approve` · `changes-requested: ⟨what to change⟩` · `abort`
```

---

## Rules

| Rule | Why |
|------|-----|
| Diff **stat** only, never the diff body | The packet is a decision aid; the human reads the diff in their own tools |
| Every acceptance criterion appears, including partial ones | Hiding a partial is how an unfinished feature gets approved |
| Deviations from the request are stated, not buried | The human's main job at this gate is catching wrong-direction work |
| Assumptions surface as open items | An unstated assumption becomes a production bug |
| No gate may be listed ✅ that was not actually run | The gate log is evidence, not a formality |
| The orchestrator returns this packet — it never asks | A subagent's question never reaches the user |

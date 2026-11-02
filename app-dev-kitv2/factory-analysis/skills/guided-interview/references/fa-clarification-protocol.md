# Clarification protocol

Used by the `guided-interview` skill (intake-normaliser at S0, requirements-analyst at S1). Adapted
from the v1 spec kit's interrogator to the v2 engine: an agent never talks to the human. It hands
questions to the engine, which pauses the feature and asks.

Questions are a cost on the human. Each round stops the pipeline until someone answers. Ask the
fewest questions that close the most gaps, and carry everything else as a default the human can see.

## The three channels

| Channel | Use it for | How it reaches the human |
|---|---|---|
| **Envelope round** | a decision no source, human note or safe default settles (a "must be true" assumption) | write the draft, then return `status: needs_clarification` with `open_questions: ["…", "…"]`; the engine stops at `CLARIFY` and shows the strings verbatim |
| **Open question with a default** | a gap a reasonable default can carry | `OQ-n` in the spec with `severity`, `default` and `status: defaulted`; GATE-A lists every unanswered question with its default |
| **Completeness round** (requirements stage only) | gaps in the 10 completeness categories | the `question` / `recommended` pair of each partial or none category in `completeness.yaml`; the engine asks them once, itself, when the score is below 85 |

The human answers a CLARIFY stop with `/factory:gate approve "<answers>"`. The text becomes a human
note `HD-n`; your next dispatch sees it in T1 ("Human notes") and in T3 as
`Human answer (HD-n): …`. Approval without text means "proceed with the options you recommended" and
creates no note.

## Budget per round

| Round | Max questions | Ask about |
|---|---|---|
| 1 | 5 | highest-priority gaps and every contradiction |
| 2 | 4 | what round 1's answers left critical |
| 3 | 2 | blockers only |
| after 3 | 0 | nothing — record the rest as open questions on the safest default (`status: defaulted`) and name them in the envelope summary |

- Count your round as 1 + the `at: CLARIFY` notes in `human-notes.yaml` that answered your own
  earlier envelope questions (the completeness round's answer does not count).
- All questions of a round go in **one** envelope. Never one question per dispatch.
- The engine's completeness round is separate and runs once. Never re-ask a topic it asked.

## Priority order

Rank every candidate, then fill the budget from the top:

1. **Conflicts** — two sources that cannot both be true (only `contradiction`; see the analysis steps).
2. **Missing acceptance criteria on `must` requirements** — no observable outcome means no test.
3. **Core entities** — shape, identity, lifecycle of the primary business object.
4. **Auth and permissions** — who may do what, and what a refused user sees.
5. **Non-functional targets** — performance, accessibility, security numbers.
6. **Edge cases and error states** — what happens when the happy path fails.
7. **Nice-to-have scope** — usually a defaulted open question, rarely asked.

**Root-cause grouping.** When several gaps come from one missing decision (no auth model → gaps in
permissions, error states and audit), ask the one root question. Its answer closes all of them.

## Question formats

| Gap type | Format | Template |
|---|---|---|
| Goal ambiguity | **Root-goal probe** (open, no options) | "What problem should <feature> solve, and how would you know three months after launch that it worked?" |
| Data shape, NFR, unstated dependency with a common pattern | **Propose + confirm** | "I'm assuming <X> because <SRC-n>. Is that right, or should it be <Y>?" |
| Two sources disagree | **Conflict resolution** | "SRC-004 says '<A>'; SRC-011 says '<B>'. Which holds, or can both be true?" |
| Scope or role unclear | **Boundary probe** | "Should <capability> apply to every <entity>, or only <subset>? Any exceptions?" |
| Happy path only | **Error / edge probe** | "What should happen when <step> fails — for example <concrete case>?" |

Prefer propose + confirm whenever a common pattern exists: the human reacts to a stated guess faster
than they invent an answer. Use an open question only when the gap is unique to the domain.

## Writing the question string

`open_questions` entries are plain strings, shown to the human as written. One string per question:

```
[<header>] <question?> (1) <label> (Recommended): <why, citing SRC/HD> (2) <label>: <trade-off>
(3) Decide during build: <what you record instead> — If unanswered: (1). Closes: <OQ-n / topic>
```

Example:

```
[Coupon user] Who may apply a coupon code? (1) Signed-in accounts (Recommended): coupons are
negotiated per B2B account (SRC-004) (2) Anyone, guests too: guest checkout must then validate codes
(3) Decide during build: OQ-2 stays defaulted to (1) — If unanswered: (1). Closes: OQ-2, permissions_roles
```

### Pre-flight checks

Drop or rewrite any question that fails one of these, and say so in the summary when you drop one:

| Check | Rule |
|---|---|
| Justifiable | names the OQ, coverage topic or completeness category it closes — no fishing |
| Non-leading | neutral wording ("Should X require sign-in?", never "Do you want proper auth?") |
| Non-compound | one decision; an "and" between two decisions means two questions |
| Distinct options | no two options mean the same thing |
| Exhaustive options | the options cover the space; add "Other" when they might not |
| Recommended first | your recommended option is (1), with its reason |
| Scannable | answerable in under 15 seconds; setup goes in the option text, not a preamble |
| Header | at most 12 characters, a noun phrase ("Auth model", "Delete mode") |
| Labels | each option label at most 5 words |
| Plain words | a domain term gets a one-line explanation |
| Escape hatch | a deferrable decision offers "Decide during build", which becomes a defaulted `OQ-n` |

## Never ask

- What a source paragraph or a human note already says — cite the SRC or HD instead.
- A decision the sources list as already made (a "Decisions" heading, meeting minutes).
- How another system behaves inside its own boundary (an existing backend's retries, audit,
  retention). Ask only how this app reacts to that system's answer.
- Standard UI states when the sources are silent and the default fits the domain: loading, empty,
  error with retry, confirmation before a destructive action, validation timing, WCAG 2.2 AA.
- Technical choices: libraries, components, endpoints, file layout. They are not the analyst's.
- Anything the stack already decides (the stack's reference architecture in T1).
- A narrower slice of a topic that was already answered.
- Scope you imagined. If a gap exists only because you pictured an extra capability, drop it.
- The same question twice. Unanswered once → it becomes a defaulted open question.

## Want versus should-want

Answers that sound like best practice hide what the person actually wants. Watch for:

- buzzwords with no number ("scalable", "modern", "fast", "clean");
- deference ("the way most apps do it", "the standard approach");
- hedges ("I should probably…", "good practice says…").

When a source or an answer reads like this, ask the unmasking question as a root-goal probe:
"If you did not have to justify this to anyone, what would you actually want here?" Record the
surface statement as the source and the answer as `HD-n`; when they differ, the difference is a real
decision worth an open question of its own.

## Assumption tiers → open questions

Every default you apply is an assumption. Tier it by the damage a wrong guess does:

| Tier | Meaning | In the spec | Asking |
|---|---|---|---|
| **Must be true** | if wrong, the feature is wrong: security model, core data shape, who may do what | `OQ-n`, `severity: blocker`, `default:` the safest reversible option, `status: open` | ask this round; after round 3 set `status: defaulted` and name it in the summary |
| **Should be true** | if wrong, rework but not failure: page size, sort order, an unusual NFR target | `OQ-n`, `severity: major`, `default:`, `status: defaulted` | ask only when the budget has room |
| **Might be true** | a standard pattern with negligible cost: skeleton loader, WCAG 2.2 AA | write it straight into the AC or NFR; no question, or `severity: minor`, `status: defaulted` when it shapes scope | never |

The spec gate fails while a `blocker` or `major` question is still `open`, and every question that is
not `answered` needs a `default`.

## After an answer

1. Map each answer to the questions it settles: `status: answered`, `answer: "<the decision> (HD-n)"`.
2. Cite `HD-n` in the `sources` of every requirement or NFR it shapes, and list it in the envelope's
   `notes_mapped` (`{ "id": "HD-n", "to": ["REQ-…", "AC-…", "OQ-…"] }`).
3. **One answer closes a topic.** A short answer ("no limit", "the server's message") is a decision.
   Detail it leaves open is yours to default (a minor defaulted question), never a narrower follow-up.
4. New scope in an answer becomes a requirement sourced from `HD-n`. It does not reopen a round.
5. An answer that creates a new contradiction is a conflict for the next round (priority 1).
6. Approval without text: your recommended options hold; set those questions to `status: defaulted`.

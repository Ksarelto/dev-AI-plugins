# frontend-dev-kit — Overview & Suggestions

_Last reviewed: 2026-08-02_

## Current state

The kit is internally consistent on its stack — React 19 + Compiler, TypeScript strict, Vite,
shadcn/ui + Tailwind, react-hook-form + zod, react-query v5, React Router v7, Zustand, react-i18next
— across `plugin.json`, `README.md`, every rule, skill, command, and agent.

The long-form version of everything here lives in [`docs/frontend/`](../docs/frontend/) at the repo
root. Docs are upstream; kit files are derived. Edit the doc, then re-derive — never patch a kit
copy and leave the doc behind. See [`docs/authoring/`](../docs/authoring/) for the rule-vs-skill
decision framework and the kit build order.

## Context budget

Rules auto-attach on glob match, so every byte is paid on every matching edit whether or not it is
relevant. That is the kit's main cost, and it was the subject of the 2026-08-02 refactor.

| | Before | After |
|---|---:|---:|
| Rule files | 13 | 9 |
| Total rule payload | 53.7 KB | 12.2 KB |
| Attached when editing one `src/**/*.tsx` | ~52 KB (~13k tokens) | ~10.4 KB (~2.6k tokens) |
| Skills | 12 | 15 |

What changed:

- **`architecture.mdc` 443 → ~60 lines.** Only the invariants, layer model, segment ownership, and
  dependency direction stay always-on. Enforcement config, state ownership, cross-feature
  communication, cross-cutting concerns, routing, lifecycle, scaling, bottlenecks, the corner-case
  playbook, testing-by-layer, and adoption moved to the new `feature-architecture` skill's
  `references/`.
- **Four style rules merged into `code-style.mdc`** (`clean-code`, `coding-standards`,
  `typescript-react`, `react-components`) — they restated the same points in four files.
- **Two React rules merged into `react.mdc`** (`react-patterns`, `react-compiler`). They previously
  cross-referenced each other to reconcile a memoization contradiction; the merge states one policy
  and deletes both reconciliation paragraphs. The React 19 Actions APIs became the `react-19-apis`
  skill.
- **`accessibility.mdc` 100 → 21 lines** — constraints stay, the Bad/Good examples, shadcn
  accessible-name detail, and verification procedure moved to the new `accessibility` skill.
- **Checklists moved to the code reviewer** (architecture review, React pre-merge) — a
  checklist is review-time material, not per-edit material.
- **Globs narrowed.** `lint-format` now attaches to config, CI, and `package.json` instead of every
  `.ts` file. `honesty` remains the only `alwaysApply: true` rule and is down to 16 lines.

Each surviving rule ends with a pointer line naming the skill that carries the detail, so
discoverability does not depend on the skill description alone.

## 2026-08-24: single-sourced stack contract

`rules/stack.mdc` (`alwaysApply: true`) is now the one declaration of the sanctioned stack. It
replaced hand-copied stack blocks in all three agents and in `skills/testing` and `skills/routing`.
Rules, skills, and agents defer to it; none restate it.

The `code-reviewer` agent became the **`code-review` skill** and the `agents/` directory was removed
along with `react-implementer` and `test-writer` — both restated rule and skill content that the
session already carries, and neither needed its own context window. The kit is now rules + skills +
MCP only.

`skills/code-review/SKILL.md` is **rule-driven**: it reads the rule files matching the
changed file types and treats every bullet as a review criterion, instead of carrying a hand-copied
severity list. That list had drifted into a lossy subset — `code-style` was represented only by
`any`, and `accessibility`, `i18n`, `shadcn-usage`, and `honesty` were near-absent. Only the
review-time checklists (React, architecture, coverage) and the severity mapping stay in the skill,
because no rule states them.

Cross-harness note: `.mdc` auto-attach is Cursor-only — Claude Code has no `rules` field in
`plugin.json`. So `code-review` reads `rules/stack.mdc` explicitly as step 0. The single source holds either way; only the loading
mechanism differs.

## 2026-08-24: rules deepened, agents removed

`accessibility` 21 → 65 lines and `react` 56 → 106 lines, plus targeted expansion of `react-query`
(20 → 44), `shadcn-usage` (18 → 30), and `i18n` (16 → 37). `code-style` gained material while
shrinking 51 → 46. `architecture` was deliberately left untouched.

This buys coverage at a real cost, and the 2026-08-02 budget no longer holds:

| | 2026-08-02 | 2026-08-24 |
|---|---:|---:|
| Total rule payload | 12.2 KB | 24.6 KB |
| Attached editing one `src/**/*.tsx` | ~10.4 KB (~2.6k tokens) | ~22.5 KB (~5.6k tokens) |
| `alwaysApply: true` rules | 1 | 2 (`stack`, `honesty`) |
| Agents | 3 | 0 |

The expansion was requested deliberately: the previous rules were thin enough that `code-review`
could pass a diff with real defects in it. If the per-edit cost proves too high, the split to make
is `react.mdc` — its "Bottlenecks" and "Corner cases" sections are the teaching half and would move
to a `react-patterns` skill, leaving the constraint half in the rule.

## Known gaps

- **`docs/` duplication is deliberate but unenforced.** `skills/feature-architecture/references/*`
  are copies of `docs/frontend/architecture/*`, because a kit must ship standalone. Nothing
  currently detects drift between the two — a `npm run validate` check comparing them would be the
  natural next step.
- **`react-19-apis` has no test or story coverage** in the kit's own examples; the API signatures
  were verified against react.dev at authoring time but will need re-checking on the next React
  minor.
- **Vite is assumed** throughout (`import.meta.env`, no RSC). Stated in README's stack assumptions
  and in `docs/frontend/react-19-apis.md`, but a consumer on Next.js would need most of
  `react-19-apis` and parts of `routing` rewritten.

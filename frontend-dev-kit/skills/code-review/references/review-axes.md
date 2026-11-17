# Review axes — questions and checklists

Walk every axis the focus includes. A "no" on a required question, or a "yes" on a smell, is a
finding: `path:line`, the axis, the rule or principle, the concrete cost, and the fix. Trace it to a
line of the diff. A documented rule in `rules/` overrides a question here. Skip anything a script
already listed. Checked-clean questions stay off the report.

Stack detail stays in the named reference. This file is the question set and the checklist.

Critical means **Blocker**. Required means **Must fix**. Size and a tenfold expansion are **Should
fix**, not a second scale.

## Correctness

Detail: [best-practices.md](best-practices.md) Correctness and Resilience, [testing.md](testing.md),
[accessibility.md](accessibility.md) for interactive UI.

- Does the change match the spec or task, including behavior the diff omitted?
- Are edge cases handled: empty, null, error, a second click, an out-of-order response?
- Do error paths surface through `AppError` and the shared notification path, or does a failure
  disappear into an empty `catch`?
- Do tests cover the new behavior, and do they assert what the user sees, what was called, or what
  was returned?
- Could the same behavior be done in fewer lines with a helper that already exists?

### Checklist

- [ ] Change matches the spec or task
- [ ] Edge cases handled
- [ ] Error paths handled
- [ ] Tests cover the change and assert behavior
- [ ] Accessibility checked for interactive UI

## Readability

- Can another engineer or agent understand this code without the author explaining it?
- Are names descriptive and consistent with project conventions? `temp`, `data`, and `result`
  without context are findings.
- Is the control flow straightforward? Nested ternaries and deep callback chains are findings.
- Is related code grouped, with a boundary that matches the slice?
- Is there a clever trick whose straightforward version is shorter?
- Could this be done in fewer lines? A thousand lines where a hundred suffice is a failure.
- Does each abstraction earn its complexity? Generalize at the third use, not the first.
- Is non-obvious intent clear from names and structure? This kit forbids comments in application and
  test code ([conventions.md](conventions.md)). A comment in the diff is a Standards finding. Do not
  ask for a comment.
- Are there dead artifacts: a no-op `_unused` binding, a backwards-compat shim, or a commented-out
  removal?
- Is a new conditional bolted onto an unrelated flow? That is a design finding. Move the logic into
  its own helper, state, or policy.
- Do repeated conditionals on the same shape appear? They signal a missing model or dispatcher. A
  branch described as temporary is debt this change should not add.

### Checklist

- [ ] Names are clear and consistent
- [ ] Logic is straightforward
- [ ] No unnecessary complexity, and a shorter shape was considered
- [ ] No dead artifacts
- [ ] No conditional bolted onto an unrelated flow

## Architecture

Detail: [architecture.md](architecture.md), [design-principles.md](design-principles.md).

- Does the change follow the existing layer, slice, public API, and state-ownership patterns?
- Does it add coupling or a dependency the screen does not need?
- Is the abstraction at the level of the surrounding code?
- Does a refactor reduce the number of concepts a reader holds? Moving the same branches into a new
  file leaves the complexity in place. Prefer the version where the branches disappear.
- Does feature logic stay out of `shared/`? A business noun in `shared/` is a misplaced entity or
  feature.
- Does this change push a file toward ~500 lines? That count is an inspection signal, separate from
  the ~500 changed-lines threshold below. Extract a helper, subcomponent, or module before adding more.

### Checklist

- [ ] Follows existing layer and slice patterns
- [ ] No unnecessary coupling or dependencies
- [ ] Abstraction level matches the surrounding code
- [ ] Refactors reduce complexity
- [ ] No feature logic in `shared/`
- [ ] File stays within a healthy size, or the extraction is named

## Design

Detail: [design-principles.md](design-principles.md), [design.md](design.md).

- Which SOLID, coupling, cohesion, or simplicity principle does this diff introduce or worsen?
- Is an abstraction, prop, or option used by only one caller?
- Is knowledge duplicated (a rule, a mapping, a key) on the second copy? Two lookalike JSX blocks
  with different reasons to change may both stay.
- Does a new case add a `switch` or `if` branch in a function that already switches on that
  discriminant, where a map entry would do?

### Checklist

- [ ] SOLID and coupling hold for the modules this change touches
- [ ] No speculative abstraction
- [ ] Duplicated knowledge is named, with the rule of three applied
- [ ] A repeated switch is a map or a component, when the diff adds another branch

## Patterns

Detail: [patterns.md](patterns.md).

- Is the pattern this stack prescribes used where the situation calls for it?
- Was a pattern added where nothing needs it (a wrapper with one caller, a context for one consumer)?

### Checklist

- [ ] Prescribed pattern is used where it applies
- [ ] No pattern added without a need

## Standards

Detail: [conventions.md](conventions.md) and the rule files named in the skill.

- Does the file follow the rules that apply to its path?
- Is the hit already in the script output? If it is, leave it there.

### Checklist

- [ ] Applicable `rules/*.mdc` checked for this path
- [ ] Conventions checked, without repeating a script hit

## Security

Detail: the Security section of [best-practices.md](best-practices.md). This kit is React FSD. The
injection shape to check is a string-built URL, query, or HTML sink. There is no SQL checklist.

- Does the change introduce a vulnerability you can trace to a line?
- Is user input validated at the boundary (zod on an API body, encoded URLs and query params)?
- Are secrets, tokens, and private keys kept out of source, logs, toasts, query keys, and version
  control?
- Is authorization enforced where the product requires it? A control hidden in the UI still needs
  the server to enforce the same rule. Flag the UI-only check.
- Are URLs and query strings built without concatenating untrusted input into a path or a
  `javascript:` URL?
- Are outputs kept out of `dangerouslySetInnerHTML` and other XSS sinks?
- Are new dependencies already trusted by the lockfile, with the changelog read for the version
  range in this change?
- Is data from APIs, logs, user content, and config files treated as untrusted until validated?
- Is that external data validated at the system boundary before it is used in logic or rendering?

### Checklist

- [ ] No secrets in code, logs, or the diff
- [ ] Input validated at boundaries
- [ ] No injection sink (HTML, URL, query string)
- [ ] Auth checks are not UI-only
- [ ] External data treated as untrusted until validated
- [ ] Dependency changes reviewed against the changelog

## Performance

Detail: the Performance section of [best-practices.md](best-practices.md). Quantify when the cost is
estimable ("this N+1 fetch adds one request per row").

- Does the change introduce a performance problem you can trace to a line?
- Is there an N+1 fetch, including a query inside a list item?
- Is there an unbounded loop or an unconstrained fetch (a list with no page size)?
- Is synchronous work blocking the hot path (a large `JSON.parse`, sort, or filter during render)?
- Are there unnecessary re-renders? This stack uses the React Compiler. Ask for `React.memo`,
  `useMemo`, or `useCallback` only when an effect dependency would otherwise retrigger every render,
  or profiling identified a hotspot (`rules/react.mdc`).
- Is pagination missing on a list view or a list request?
- Are large objects created on a hot path?

### Checklist

- [ ] No N+1 fetches
- [ ] No unbounded loops or unconstrained fetches
- [ ] No heavy synchronous work in render
- [ ] Pagination present on list views and list requests
- [ ] No preemptive memoization

## Change sizing

Small, focused changes are easier to review, faster to merge, and safer to deploy.

- ~100 lines changed: a good size, reviewable in one sitting.
- ~300 lines changed: acceptable when it is a single logical change.
- ~500 lines changed: too large. Split it. This is a **Should fix**, not a Blocker. Complete file
  deletions and automated refactors are the exception: verify intent, not every line.
- ~500 lines in one file is a separate signal. A small diff that pushes an already-large file across
  that line asks for an extraction before more code is added.

One change is a single self-contained modification that addresses one thing, includes its tests, and
leaves the system working. One part of a feature is one change. The whole feature is not.

A change that refactors existing code and adds new behavior is two changes. Submit them separately.
A small cleanup such as a rename may stay, at reviewer discretion.

When the diff is too large, name one strategy:

- **Stack.** Submit a small change, then start the next from it. Use when the steps depend on each
  other in order.
- **By file group.** Separate changes for groups that need different reviewers. Use for cross-cutting
  concerns.
- **Horizontal.** Land the shared code or stubs first, then the consumers. Use for a layered
  architecture.
- **Vertical.** Break the feature into smaller full-stack slices. Use for feature work.

## Simpler path and reuse

On every change, answer both:

- **Simpler path.** Can the same behavior be implemented in substantially fewer lines? A roughly
  tenfold expansion with no extra behavior is a **Should fix** and includes the shorter shape.
- **Reuse.** For each new component, hook, helper, or mapper, search the repo for an existing
  implementation. The search covers the symbols and shapes this diff adds.
  - A primitive that already exists in `shared/ui` is reused.
  - Domain logic stays on the owning entity or feature.
  - A stack-wide helper with no business noun promotes to `shared/lib` on the third use.
  - One new conditional bolted onto an unrelated flow is extracted into a helper, state, or policy.

## Dead code

After the change, list code that is now unreachable or unused: orphaned exports, `_unused` bindings,
backwards-compat shims, commented-out removals. Ask, and wait: "Should I remove these now-unused
elements: [list]?" Leave the code in place until the author answers. When the list is empty, write
`none`.

## Disagreements

Resolve a dispute in this order:

1. Technical facts and measured data.
2. The style guide and `rules/*.mdc` on style.
3. Engineering principles (the design and architecture references) on structure.
4. Consistency with the surrounding code, when that consistency keeps the codebase healthy.

An issue this change introduced is fixed before submission. A genuine emergency is the only reason
to defer it, and the deferral is written down. Pre-existing debt the diff did not touch stays one
line under "Pre-existing". If it should be fixed separately, ask for a filed bug assigned to the
author. Do not turn the review into a rewrite of untouched code.

If the author has the full context and disagrees on a **Consider**, defer to their judgment and
record it. Comment on the code.

## Honesty

- Read the diff. "LGTM" with no findings and no statement of what was checked is not a review.
- A bug that will hit production is a Blocker. State the failing case.
- Quantify when you can. "This N+1 fetch adds one request per row" beats "this could be slow."
- When the approach has a clear problem, say so and propose the alternative.
- Accept an override on a Consider when the author has context you do not. Defer, and say what you
  deferred.

## Rationalizations

Reject these:

- "It works, that's good enough." Working code that is unreadable, insecure, or architecturally
  wrong adds debt that compounds.
- "I wrote it, so I know it's correct." The author cannot see their own assumptions. The review is
  the second reading.
- "We'll clean it up later." Cleanup of a problem this change introduced happens in this change.
- "AI-generated code is probably fine." Generated code is confident when it is wrong. Read it at
  least as closely as human-written code.
- "The tests pass, so it's good." Tests miss architecture, security, and readability. They are one
  input to the verdict.
- "The refactor makes it cleaner." Count the concepts a reader still holds. Relocating the same
  branches is not a simpler design. Look for the version where the branches disappear.
- "It's only a small addition to this file." Judge the file after the change. A small diff can cross
  the file-size signal and bolt a branch onto an unrelated flow.
- "It's just a version bump." A bump is a behavior change the diff did not write. Read the changelog
  for that range. Semver is not a guarantee.
- "I'll upgrade everything in one PR to save time." One dependency per change. A bulk bump that
  breaks the build hides which package did it.

## Verification

Complete this before the verdict. A box you could not check is a line under "Not verified".

- [ ] I understand what this change does and why
- [ ] Every Blocker is listed. Any Blocker means Request changes
- [ ] Every Must fix is listed. Must fix and no Blocker means Approve with changes
- [ ] A deferred Should fix has a written justification
- [ ] Tests were run, or the gap is named
- [ ] Typecheck and lint were run, or the gap is named
- [ ] Build was run when the project has one, or the gap is named
- [ ] When `package.json` or the lockfile is in the diff: the changelog for that version range was
      read, this change bumps one dependency, and the lockfile diff was reviewed
- [ ] Dead code is listed, or there is none, and nothing was deleted during the review

### Verdict

- [ ] **Approve** — no Blocker and no Must fix
- [ ] **Approve with changes** — Must fix, no Blocker
- [ ] **Request changes** — one or more Blockers

---
name: clean-code
description: Clean code principles — naming, function size, complexity, magic values, dead code, and comment discipline. Use when writing new code, refactoring, or reviewing a diff for readability/maintainability issues. Applies to any language.
---

# Clean Code

This skill embodies the principles of "Clean Code" by Robert C. Martin (Uncle Bob). Use it to transform "code that works" into "code that is clean."

> "Code is clean if it can be read, and enhanced by a developer other than its original author." — Grady Booch

## When to use

- Writing new code: to ensure high quality from the start.
- Reviewing pull requests: to provide constructive, principle-based feedback.
- Refactoring legacy code: to identify and remove code smells.
- Improving team standards: to align on industry-standard best practices.

## 1. Meaningful names

- Use intention-revealing names: `elapsedTimeInDays` instead of `d`.
- Avoid disinformation: don't use `accountList` if it's actually a `Map`.
- Make meaningful distinctions: avoid `ProductData` vs `ProductInfo`.
- Use pronounceable/searchable names: avoid `genymdhms`.
- Class names: use nouns (`Customer`, `WikiPage`). Avoid `Manager`, `Data`.
- Method names: use verbs (`postPayment`, `deletePage`).

## 2. Functions

- Small!: functions should be shorter than you think.
- Do one thing: a function should do only one thing, and do it well.
- One level of abstraction: don't mix high-level business logic with low-level details (like regex).
- Descriptive names: `isPasswordValid` is better than `check`.
- Arguments: 0 is ideal, 1–2 is okay, 3+ requires a very strong justification.
- No side effects: functions shouldn't secretly change global state.

## 3. Comments

Don't comment bad code — rewrite it. Most comments are a sign of failure to express ourselves in code.

Explain yourself in code:

```
# Check if employee is eligible for full benefits
if employee.flags & HOURLY and employee.age > 65:
```

vs.

```
if employee.isEligibleForFullBenefits():
```

- Good comments: legal, informative (regex intent), clarification (external libraries), TODOs.
- Bad comments: mumbling, redundant, misleading, mandated, noise, position markers.

## 4. Formatting

- The newspaper metaphor: high-level concepts at the top, details at the bottom.
- Vertical density: related lines should be close to each other.
- Distance: variables should be declared near their usage.
- Indentation: essential for structural readability.

## 5. Objects and data structures

- Data abstraction: hide the implementation behind interfaces.
- The Law of Demeter: a module should not know about the innards of the objects it manipulates. Avoid `a.getB().getC().doSomething()`.
- Data Transfer Objects (DTO): classes with public variables and no functions.

## 6. Error handling

- Use exceptions instead of return codes: keeps logic clean.
- Write try-catch-finally first: defines the scope of the operation.
- Don't return null: it forces the caller to check for null every time.
- Don't pass null: leads to `NullPointerException`.

## 7. Unit tests

The Three Laws of TDD:

1. Don't write production code until you have a failing unit test.
2. Don't write more of a unit test than is sufficient to fail.
3. Don't write more production code than is sufficient to pass the failing test.

F.I.R.S.T. principles: Fast, Independent, Repeatable, Self-Validating, Timely.

## 8. Classes

- Small!: classes should have a single responsibility (SRP).
- The Stepdown Rule: we want the code to read like a top-down narrative.

## 9. Smells and heuristics

- Rigidity: hard to change.
- Fragility: breaks in many places.
- Immobility: hard to reuse.
- Viscosity: hard to do the right thing.
- Needless complexity/repetition.

## Implementation checklist

- [ ] Is this function smaller than 20 lines?
- [ ] Does this function do exactly one thing?
- [ ] Are all names searchable and intention-revealing?
- [ ] Have I avoided comments by making the code clearer?
- [ ] Am I passing too many arguments?
- [ ] Is there a failing test for this change?

## Limitations

- Use this skill only when the task clearly matches the scope described above.
- Do not treat the output as a substitute for environment-specific validation, testing, or expert review.
- Stop and ask for clarification if required inputs, permissions, safety boundaries, or success criteria are missing.

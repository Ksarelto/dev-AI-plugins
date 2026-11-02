# The seven lenses — questions and evidence per lens

Each lens has one question. Ask it of every file in the change set, write what you find, then move to
the next lens. A problem belongs to the first lens in this order that explains it; never file it twice
under two lenses. Stack-specific checks (FSD, layering, LangGraph) are in the lens-group references;
they still carry one of these seven `lens` values.

## 1. `behaviour` — behaviour preservation

Mandatory for change requests (`mode: change-request`, a delta-spec). Optional otherwise.

- Read the delta-spec's `unchanged_guarantees` and `removed`. For each guarantee, find the code path
  that provides it today and check the change keeps it: same status codes, same rendered text, same
  defaults, same ordering, same permission checks.
- A removed REQ: the code, route, nav entry, locale keys and tests that served it are gone, and
  nothing else still links to it.
- A public signature that changed (exported function, component prop, endpoint request or response):
  every caller in the change set was updated, and callers outside the change set still type-check
  only because the change is additive.
- Characterisation tests: if the plan had them, they still exist and were not edited to match new
  behaviour.

Typical severity: a broken guarantee is P1; a removed REQ still reachable is P1; a changed default
the spec did not mention is P1 when users see it, P2 when only internal.

## 2. `assumptions` — hidden assumptions

What does the code take for granted that the spec, the contract or the ADRs do not guarantee?

- Data: a field that may be missing or `null` in the contract is read without a check; a list
  assumed non-empty; an ID assumed numeric; money as a float; dates without a time zone.
- APIs: a call assumed to succeed (no error branch), assumed fast (no timeout or loading state),
  assumed idempotent (retried), assumed to return all rows (no pagination).
- Users: a role assumed present, a locale assumed `en`, a viewport assumed wide, a single tab.
- Environment: a variable read without validation, a feature flag assumed on, a clock assumed UTC.

Evidence is the line that assumes, plus the contract or spec line that does not promise it.

## 3. `spec-adr-drift` — spec and decision drift

Does the code do what the ACs say, the way the recorded decisions say?

- Walk every AC in the spec (`kind` happy, error, edge, permission, nfr). For each: the code that
  implements it (file:line) and whether a user can reach it from the entry the stories name. An AC
  with no implementation, or implemented but unreachable (component never rendered, route never
  mounted, operation never wired), is P1 with `ac` set.
- Exact values: the AC's numbers, texts, limits and formats appear as stated (10.00 EUR, 3 attempts,
  max 50 items). A different value is P1.
- NFRs: each performance, accessibility or security NFR has a visible mechanism (a limit, a cache, a
  label, a guard). Missing is P1 when the NFR is measurable and the code clearly does not meet it.
- ADRs and the component map: the code sits where the map put it, uses the library the ADR chose,
  and follows the stack's `reference_architecture`. A silent departure is P1 when it breaks a
  decision, P2 when it only bends it.
- API contract: request and response shapes, status codes and error codes match `api-contract.yaml`.
  (Missing operations are the openapi audit's job; you judge shapes and semantics.)
- Human notes (`HD-n`) in T1: each one that applies is visible in the code.

## 4. `tests` — independent tests

Do the tests prove the ACs, independently of the code they test?

- Each AC has at least one test that would fail without the change and uses the AC's exact values.
  Rule-shaped ACs (a calculation, a limit) have a second example with other values.
- The acceptance tests (`*.acceptance.test.*`) were written from the spec and are locked; you judge
  the unit and component tests the builders' test authors wrote.
- Over-mocking: the unit under test, its own hooks, child components, or the behaviour the test
  claims to prove is mocked. A test that asserts only that something rendered, was defined, or was
  called, without the observable outcome, proves nothing.
- Test smell that hides a bug: assertions on implementation details (call order, internal state),
  snapshots of whole trees, `expect(true)`, conditionals inside tests, shared mutable fixtures.
- Code special-cased to the test: `if (code === "B2B10")`, a constant equal to the AC's number with
  no rule behind it, a branch only a test fixture takes. This is P0 when it fakes an AC.
- Error and unhappy paths named in the ACs (kind error, edge, permission) have tests.

Missing-test detection by file (one test file per executable file) is not yours when a convention
check covers it; you judge whether the tests that exist prove the criteria.

## 5. `edge-cases` — edge cases

Mandatory on standard and full tiers.

- Empty: no rows, empty string, whitespace-only input, zero, an empty cart.
- Boundary: exactly the limit, one over, one under; first and last page; the maximum length.
- Failure: the dependency returns 4xx, 5xx, times out, returns malformed data; partial failure in a
  batch; a transaction that fails half way.
- Concurrency: double submit, two requests racing for the same row, a stale cache after a mutation,
  an unmounted component receiving a late response.
- Locale and format: long translations, right-to-left, decimal separators, currencies, time zones.

Only file an edge case the code actually mishandles (show the line), not one you could test.

## 6. `security` — security and tool surface

- Input: every external input validated at the edge (body, query, params, headers, env, files,
  model output used as data). Length and size caps exist.
- Injection: SQL built from strings, `dangerouslySetInnerHTML` or unescaped HTML, shell commands,
  path joins with user input, regex from user input, prompt text from untrusted sources.
- Secrets: keys, tokens or passwords in code, logs, errors, responses, client bundles or tests.
- AuthN/AuthZ: a protected route without a guard, a role check that trusts the client, a resource
  read or written without an ownership check (IDOR), a token without expiry or algorithm pinning.
- Data exposure: responses or tool outputs with fields the caller may not see; stack traces or
  internal messages in errors.
- Security-sensitive paths (auth, payments, secrets, permissions, migrations that drop data): even
  with no problem found, add one P3 finding "security-sensitive path changed: <file> — human review
  at GATE-C" so it reaches the PR's open items.

## 7. `over-engineering` — over-engineering

- An abstraction with one use (factory, generic hook, base class, plugin point), an option or
  configuration no AC asks for, a new dependency where the stack or the codebase already has one.
- Code outside the scope of the feature: refactors of files the plan did not list
  (`outside_plan` in the change set), reformatting, renamed symbols.
- Duplicated logic that already exists in a shared module the component map named as reuse.
- Dead code: unused exports, branches that cannot run, commented-out blocks, leftover debug output.

Typical severity: P2 when it adds risk or maintenance (new dependency, duplicated rule), P3 when it
is only extra. A new dependency without an approved dependency task is P1 (`new_dependency` is
human-owned).

## Large change sets

Over about 15 source files: first a per-file pass (all seven lenses, file by file), then one
cross-file pass over your per-file notes — a contract between two files that does not match, a
state that one file sets and no file reads, the same rule implemented twice. Report both passes'
findings together; de-duplicate before you return.

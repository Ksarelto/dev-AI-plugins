# Acceptance-test patterns per stack

Every pattern drives the **highest public surface that the stack's `test` command runs** — the
acceptance gate runs that command (the one in the role's `stack.yaml`, scoped to changed files), so
a test in a folder or project it does not include is reported `not-run`. You cannot read `src/`; you
learn the surface from the component map (pages, slices, public entry points, props), the API
contract (operations, bodies, status and error codes) and the agent design. Helpers under `tests/`
(outside `src/`) are readable: look there for the render wrapper or app builder before writing one.

The stack's testing skill (T1) is the reference for the test runner, the render wrapper and what may
be mocked; follow it, with one stricter rule: fake only what lies **outside the feature**.

## Frontend — `frontend-dev-kit` (Vitest + Testing Library, jsdom)

- Runner: the stack's `test` command is Vitest (`test:run`) over `src/**/*.test.ts(x)`. Testing
  Library drives the page; Playwright end-to-end specs are not run by that command, so do not write
  them unless the stack's `test` command runs them.
- File: `src/pages/<page>/<story-slug>.acceptance.test.tsx` next to the page the component map
  names (or the widget/feature entry when the story has no page of its own).
- Surface: import the page or the slice's public `index.ts` only (`@/pages/checkout`,
  `@/features/apply-coupon`) — never a deep path. Render through the project's test render wrapper
  (`frontend-dev-kit:testing` names it, e.g. `@/shared/lib/rendererRTL`) so router, query client
  and i18n are real.
- Network: mock `httpClient` in `@/shared/api/base` (the one boundary the stack allows outside a
  slice) and answer with the bodies and status codes from `api-contract.yaml`. When the component
  map gives the page an injected dependency instead (a prop such as `applyCoupon`), pass a fake that
  returns the contract's responses.
- Interact like a user: `userEvent.type(screen.getByLabelText(...))`, `userEvent.click(screen.getByRole("button", { name: ... }))`; assert with `findByRole`, `findByText`, `toHaveTextContent`. Query by role and label, the way the AC describes the UI; assert the English copy from the AC, never a translation key.
- States: an AC of kind error or edge gets its failing response (4xx/5xx, empty list); assert the
  message and that the previous value stays.
- Permissions: render as each role the AC names (the auth state the wrapper or a contract response
  provides) and assert the control is absent or disabled.

```tsx
import userEvent from "@testing-library/user-event";
import { screen } from "@testing-library/react";
import { render } from "@/shared/lib/rendererRTL";
import { httpClient } from "@/shared/api/base";
import { CheckoutPage } from "@/pages/checkout";

vi.mock("@/shared/api/base", async (importOriginal) => ({ ...(await importOriginal()), httpClient: { post: vi.fn() } }));

test("AC-0002 an expired coupon shows 'This coupon has expired' and keeps 105.00 EUR", async () => {
  vi.mocked(httpClient.post).mockRejectedValueOnce({ status: 410, code: "COUPON_EXPIRED" });
  render(<CheckoutPage />);
  await userEvent.type(screen.getByLabelText("Coupon code"), "OLD");
  await userEvent.click(screen.getByRole("button", { name: "Apply" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("This coupon has expired");
  expect(screen.getByTestId("total")).toHaveTextContent("105.00 EUR");
});
```

Fails now because: `@/pages/checkout` has no coupon field yet (no "Coupon code" label), or the page
module does not exist (import error — a valid red). Passes at verification when the feature works.

## Backend — `node-backend-dev-kit` (Vitest + supertest)

- Runner: the stack's `test` command is `test:unit` (`vitest --project unit`, `tests/unit/**`). The
  integration project (`createTestApp()` in `tests/helpers/test-app.ts`, real Postgres through
  Testcontainers) is **not** run by the acceptance gate.
- File: `tests/unit/acceptance/<story-slug>.acceptance.test.ts`.
- Surface, in this order of preference:
  1. supertest against `createApp()` built by a helper in `tests/helpers/` that wires the app over
     in-memory repositories (`createInMemoryRepositories()`) and `testEnv()`. Drive the contract's
     operations: method, path, body, auth header; assert status, `content-type`, body shape and
     the problem+json `code` the contract names.
  2. When no such helper exists, the service factory the component map names, with the in-memory
     repositories from `tests/helpers/`, asserting the returned DTO or the `AppError` code the
     contract maps to the status. Record this in `deviations` (HTTP status and validation are then
     proved only at the integration level).
  Never a test under `tests/integration/` and never `createTestApp()` in this stage.
- Auth: obtain a token the way the contract does (register + login operations), or sign one with
  the test JWT helper in `tests/helpers/` when it exists.
- Permission ACs: one test per role named, plus no token (401) and another user's resource (404 or
  403 as the contract says).

```ts
import request from "supertest";
import { createUnitApp } from "../../helpers/unit-app.js"; // the project's in-memory app helper

test("AC-0007 creating a project with a duplicate name returns 409 PROJECT_NAME_TAKEN", async () => {
  const { app, tokenFor } = createUnitApp();
  const auth = { authorization: `Bearer ${await tokenFor("amy")}` };
  await request(app).post("/api/v1/projects").set(auth).send({ name: "Atlas" }).expect(201);
  const res = await request(app).post("/api/v1/projects").set(auth).send({ name: "Atlas" });
  expect(res.status).toBe(409);
  expect(res.body.code).toBe("PROJECT_NAME_TAKEN");
});
```

(`createUnitApp` stands for whatever the project's helper is called; read `tests/helpers/` for it.)
Fails now because: the route is not mounted (404) or the service does not exist (import error).

## AI agent — `node-agent-dev-kit` (Vitest, scripted model)

- Runner: `test:unit` (`tests/unit/**`); the eval suite (`npm run eval`, real models) is the eval
  author's — acceptance tests never call a real model or the network.
- File: `tests/unit/acceptance/<story-slug>.acceptance.test.ts`.
- Surface: the agent service or graph factory the agent design / component map names, built with
  the helpers in `tests/helpers/`: the scripted model (`scripted-model.ts`), in-memory threads, a
  memory checkpointer, synthetic embeddings or a fake retriever. Script the model's turns (tool call,
  answer); assert what the graph did — the tool it called with which arguments, the guard that
  blocked, the reply and citations the service returned, the iteration cap message.
- Behaviour the scripted model decides by itself (answer quality, refusal wording) is not provable
  here: name it in `deviations` as covered by the eval suite, and test the deterministic part (the
  guard blocks, the tool requires approval, the citation filter drops a foreign ref).

```ts
import { scriptedModel, callTool, answer } from "../../helpers/scripted-model.js";

test("AC-0011 a refund request pauses for approval before issue_refund runs", async () => {
  const model = scriptedModel([callTool("issue_refund", { orderId: "o-1", amount: 20 }), answer("Done")]);
  const { service, refunds } = setupSupportAgent(model); // built from tests/helpers fakes
  const turn = await service.reply({ userId: "u-1", threadId: "t-1", message: "Refund order o-1" });
  expect(turn.status).toBe("awaiting_approval");
  expect(refunds.issued).toHaveLength(0);
});
```

Fails now because: the tool or the approval step does not exist (import error or the refund runs
without pausing).

## Rules that apply to every stack

- One test per AC at least; the AC ID is the first word of the `test(...)` / `it(...)` title,
  written as a plain string literal — not only in a `describe`, not built with `${}` and not inside
  `test.each` (when a file fails to import, the gate reads names from the source text).
- Rule-shaped ACs get a second example with other values (`AC-0003 … second example: 40 − 4 + 5`).
- No setup-only or sanity test: every test in the file must fail now.
- No reading, copying or guessing of implementation code; no assertion on internals (call order,
  state shape, private functions).
- Use the exact values, texts and codes from the AC, the Gherkin and the contract.

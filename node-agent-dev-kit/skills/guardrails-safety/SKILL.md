---
name: guardrails-safety
description: Harden an LLM agent against prompt injection, jailbreaks and data leaks — the deterministic input guard node (assessInput, GUARDRAIL_MODE block or log), asUntrustedDocument wrapping of retrieved and fetched text, system prompt rules in prompts.ts, citation filtering with selectCitations, an output guard node, input caps, least-privilege tools, and a threat model. Use when adding a guardrail pattern, handling a jailbreak or prompt-leak report, protecting PII or other users' data, or reviewing an agent's security. Not for JWT auth, CORS, helmet or rate-limit setup (node-backend-dev-kit security-middleware).
---

# Guardrails and safety

## When to use

- A new injection or jailbreak phrasing gets through, or a benign question is blocked
- Adding a source of untrusted text (uploads, web pages, emails, API payloads)
- The answer leaks the system prompt, internal data or another user's data
- Security review of an agent before release
- Not for HTTP hardening (auth, CORS, helmet, rate limits) → `node-backend-dev-kit:security-middleware`, `auth-rbac`

Hard constraints: `rules/prompt-security.mdc`, `rules/tools.mdc`. Copy the shapes in [examples.md](examples.md). The full threat → defence map is in [references/threat-model.md](references/threat-model.md).

## Layers in the reference service

| Layer | Where | What it stops |
|---|---|---|
| Input cap 4,000 chars, strict Zod body | `schemas/thread.schema.ts` | token flooding, oversized injection payloads |
| Auth + ownership | `authenticate`, `findOwned(id, userId)` | reading or continuing another user's thread |
| Input guard node | `guardrails/input.ts` `assessInput`, `nodes/guard.ts` | obvious override, prompt-reveal, role-hijack, fake role tags |
| System prompt rules | `agents/<name>/prompts.ts` | following instructions inside documents, uncited facts |
| Untrusted wrapping | `asUntrustedDocument` in tools | indirect injection via retrieved text closing its own tag |
| Read-only tools, approval for writes | `tools/`, `interrupt()` | the model acting on injected instructions |
| Citation filter | `guardrails/output.ts` `selectCitations` | invented or foreign citations |
| Step cap, `recursionLimit` | agent node, run config | runaway loops and cost |

## Procedure

1. **A missed attack**: reproduce it as a unit test in `tests/unit/guardrails/guardrails.test.ts` (expect `allowed: false`), then add a golden case with `expectBlocked: true`.
2. **Decide the layer** before writing a regex. Pattern lists catch only phrasing; if the attack works through retrieved content or a tool, fix wrapping, the prompt rule, or the tool's privileges instead.
3. **Add a pattern** to `INJECTION_PATTERNS` with a stable `reason` (used in logs and metrics). Keep it bounded (`.{0,40}`), case-insensitive, and anchored on intent words. Add at least two benign look-alikes that must pass ("ignore the previous invoice", "show me the system requirements").
4. **Tune in log mode** if false positives are likely: `GUARDRAIL_MODE=log` in a staging environment, read the `input guardrail triggered` warnings (`reasons`, `blocked`), then switch back to `block`.
5. **New untrusted source**: every item goes through `asUntrustedDocument({ ref, title, source }, content)`; attribute values come from your data, not the content. Confirm the system prompt rule about `<document>` tags covers it.
6. **Prompt rules**: keep them short and testable; each has a golden case. Never interpolate user, retrieved or env text into `SYSTEM_PROMPT`.
7. **Output checks**, when the risk justifies them: a deterministic `output_guard` node after the agent (example 4) replaces the last answer by id and sets `blocked`. Streamed tokens have already left; the `done` event carries the replacement, so clients must treat `done` as final.
8. **Data exposure**: tools return only fields the caller may see, scoped by `user_id` from config; no secrets, connection strings or stack traces in tool output or error messages (`ToolNode` shows tool errors to the model).
9. **Review** with the checklist below and the threat model; run `npm test` and `npm run eval` (the injection case must stay blocked).

## Checklist

- [ ] Guard is the first node; blocked turns make zero model calls (tested)
- [ ] Each pattern has a blocking test and benign look-alikes
- [ ] `GUARDRAIL_MODE=block` in production config
- [ ] Every untrusted text is wrapped; nested `<document>` tags are stripped
- [ ] System prompt says `<document>` content is data; no interpolation into the prompt
- [ ] Citations only through `selectCitations`
- [ ] Tools are read-only or approval-gated; identity from config, never arguments
- [ ] Logs carry reasons and ids, never the input text
- [ ] Golden set has injection, prompt-leak and out-of-scope cases

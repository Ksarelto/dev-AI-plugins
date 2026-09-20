# React Dev Kit

Plugin for building React applications with **TypeScript**, **shadcn/ui**, **Tailwind CSS**, **react-hook-form + zod**, and **react-query**.

## Install

```bash
# Full marketplace
ln -s /path/to/dev-cusor-plugins ~/.cursor/plugins/local/dev-cursor-plugins

# This plugin only
ln -s /path/to/dev-cusor-plugins/frontend-dev-kit ~/.cursor/plugins/local/frontend-dev-kit
```

Reload Cursor (Command Palette → "Developer: Reload Window").

## Components

### Rules

Auto-apply when editing matching files. Rules carry constraints only — the reasoning, examples, and
procedures live in skills, so a file edit costs ~2.5k tokens of rules rather than ~13k.

| Rule | Globs | Topic |
|------|-------|-------|
| `architecture` | `src/**/*` | Layer model, segment ownership, pure core and ports, dependency direction |
| `component-structure` | `**/features|widgets|entities/**/ui/**`, `**/shared/ui/**` | Kebab-case component folders and files (`button.tsx`, `custom-button.tsx`); PascalCase export |
| `code-style` | `**/*.{ts,tsx}` | TypeScript discipline, naming, complexity, components, JSX, quality bar |
| `react` | `**/*.{tsx}` | Purity, hooks rules, effects, keys, memoization under the Compiler, refs, boundaries |
| `shadcn-usage` | `**/*.{tsx}` | shadcn/ui primitives and theming boundaries |
| `accessibility` | `**/*.{tsx}` | Semantic elements, labels, focus, ARIA restraint |
| `i18n` | `**/*.{tsx}` | react-i18next, translation keys, pluralization, locale-aware formatting |
| `react-query` | `**/api/**`, `**/hooks/use*.ts` | Key ownership, hook boundaries, invalidation |
| `lint-format` | config, CI, `package.json` | ESLint flat config, Prettier, lint-staged, CI steps |
| `honesty` | `**/*.{ts,tsx,md}` (always) | Verify APIs before coding, flag uncertainty |
| `stack` | `**/*.{ts,tsx,mdc,md,json}` (always) | **Canonical** sanctioned stack — which library owns which concern |

### Skills

Workflow guides with few-shot templates in each skill's `examples.md`.

| Skill | Use when |
|-------|----------|
| `react-feature` | Building a new page or feature slice |
| `architecture-audit` | Checking whether `src/` matches the FSD layer/slice/segment model; report violations, then fix after confirmation |
| `feature-architecture` | Deciding where code belongs, ports and use cases, state ownership, cross-feature deps and workflows, splitting a feature, boundary enforcement |
| `accessibility` | Auditing or fixing a11y; shadcn accessible names; verifying with axe or Playwright |
| `react-19-apis` | `useActionState`, `useOptimistic`, `use()`, async `<form action>` |
| `react-query-hook` | Creating query or mutation hooks |
| `rhf-form` | Building forms with react-hook-form + zod |
| `tailwind-styles` | Styling a component with Tailwind + cn() |
| `routing` | Setting up React Router v7, protected routes, lazy loading |
| `zustand` | Client-side state management |
| `error-handling` | QueryClient errors, error boundaries, 422 field mapping |
| `testing` | Vitest + RTL + MSW test patterns |
| `storybook` | Component stories, MSW decorators, play functions |
| `api-client` | Typed fetch wrapper, ApiError, auth headers |
| `stack-docs` | Fetching current library docs via Context7 |
| `browser-debug` | UI verification and debugging via Chrome |
| `code-review` | Reviewing a diff, branch, or PR against every applicable rule, with severity ratings |

### MCP Servers

| Server | Purpose |
|--------|---------|
| `context7` | Fetch current docs for React, shadcn/ui, Tailwind, react-query, react-hook-form |
| `chrome-devtools` | Connect to Chrome for UI debugging and verification |
| `playwright` | Automate browser interactions for repeatable flows |
| `gitlab` | Read issue descriptions, MR diffs, and pipeline status |
| `atlassian` | Read Jira tickets and Confluence pages for requirements |

**Context7 setup:** set `CONTEXT7_API_KEY` in your environment.

**Chrome DevTools setup:**
1. Use Chrome 144+ and enable remote debugging at `chrome://inspect/#remote-debugging`
2. Keep Chrome open with your dev app; approve the debugging permission when prompted

**Playwright setup:** no env vars required; runs via `npx @playwright/mcp@latest`.

**GitLab setup:** set `GITLAB_PERSONAL_ACCESS_TOKEN` and `GITLAB_API_URL` in your environment.

**Atlassian setup:** set `JIRA_URL`, `JIRA_USERNAME`, `JIRA_API_TOKEN`, `CONFLUENCE_URL`, `CONFLUENCE_USERNAME`, and `CONFLUENCE_API_TOKEN` in your environment.

## Few-shot examples

- **Skills** → `skills/{skill-name}/examples.md` (full scenario templates)
- **References** → `skills/{skill-name}/references/` (advanced patterns)

## Stack assumptions

**[`rules/stack.mdc`](rules/stack.mdc) is canonical** — it is the one place the stack is declared,
and it is loaded on every session. Every other rule and skill defers to it rather than restating it,
so changing a library is a one-file edit.

Summary: React 19 + React Compiler · TypeScript strict · Vite + `import.meta.env` (SPA, no RSC) ·
shadcn/ui + Tailwind · `react-hook-form` + `zod` · `@tanstack/react-query` v5 · native `fetch` ·
React Router v7 · Zustand · `react-i18next` · Vitest + RTL + MSW · Storybook CSF3 · ESLint flat
config + Prettier via `lint-staged`.

In Cursor the rule auto-attaches via `alwaysApply: true`. Claude Code does not load `.mdc` rules at
all (`rules` in `plugin.json` is a Cursor mechanism), so skills that depend on the contract —
`code-review` most of all — read `rules/stack.mdc` explicitly as their first step.

# React Dev Kit

Plugin for building React applications with **TypeScript**, **shadcn/ui**, **Tailwind CSS**, **react-hook-form + zod**, and **react-query**.

## Install

### Claude Code

```text
/plugin install frontend-dev-kit@dev-AI-plugins
```

Local development from this marketplace repo:

```bash
claude --plugin-dir ./frontend-dev-kit
```

### Cursor

From this marketplace repo:

```bash
npm run install:cursor-local
```

Then **Developer: Reload Window** and enable the kit under **Customize → Plugins**.

`feature-dev-kit` requires this plugin.

## Components

### Rules

Auto-apply when editing matching files. `honesty` is the only rule with `alwaysApply: true`.
The others attach only when a matching file is in context.

| Rule | When it attaches | Topic |
|------|------------------|-------|
| `honesty` | Every session (`alwaysApply`), and `**/*.{ts,tsx,md}` | Verify library APIs before generating code; flag uncertainty; never fake a passing test |
| `general-coding-principles` | `**/*.{ts,tsx}` | Naming, function design, no comments, no magic values or closed-set literals, quality bar |
| `typescript` | `**/*.{ts,tsx}` | Interfaces vs types, strictness, narrowing, utility types, explicit public signatures |
| `react` | `**/*.tsx` | Purity, hooks, no JSX ternaries, named handlers, effects, keys, memoization under the Compiler, refs, error boundaries |
| `component-structure` | `**/{features,widgets,entities,pages}/**/ui/**`, `**/shared/ui/**` (`*.ts`, `*.tsx`) | Kebab-case component folders and files; PascalCase export; `index.ts` exports only what an outside file imports |
| `styling` | `**/styles.ts`, `**/*.tsx`, `**/*.css` | All Tailwind classes in `styles.ts`, none inline; motion only from shadcn bases; look from theme tokens |
| `shadcn` | `**/shared/ui/**`, `**/components.json`, `**/globals.css` | Registry source verbatim (parts, `data-slot`, classes, `tw-animate-css` motion); closed-set constants (`ButtonVariant`) |
| `i18n` | `**/*.tsx`, `**/locales/**`, `constants.ts`, `config/`, `model/` | Every user-visible string from typed keys — `shared/lib/i18n/locales/common` or the slice's `locales/`; no string maps |
| `testing` | `**/src/**/*.{ts,tsx}`, tests | Every executable file ships with a behavior test; mock only the boundary |

A typical `.tsx` edit under `features|widgets|entities|pages/**/ui/` loads `honesty`,
`general-coding-principles`, `typescript`, `react`, `component-structure`, `styling`, `i18n`, and
`testing`; under `shared/ui/` it adds `shadcn`. A `styles.ts` edit loads `honesty`,
`general-coding-principles`, `typescript`, `styling`, and `testing`. A plain `.ts` module loads
`honesty`, `general-coding-principles`, `typescript`, and `testing`.

### Skills

Workflow guides. Skills that ship templates keep them in `examples.md` (`architecture-audit`, `code-review`, `manage-feature`, and `testing` use `references/` instead).

| Skill | Use when |
|-------|----------|
| `react-feature` | Building a new page or feature slice |
| `react-component` | Scaffolding one component folder (`name.tsx`, `styles.ts`, `index.ts`) |
| `architecture-audit` | Checking whether `src/` matches the FSD layer/slice/segment model; report violations, then fix after confirmation |
| `accessibility` | Auditing or fixing a11y; shadcn accessible names; verifying with axe or Playwright |
| `shadcn-usage` | Composing and wrapping shadcn/ui primitives |
| `tailwind-styles` | Styling a component in its `styles.ts` with Tailwind, `cva()`, and tokens |
| `react-query-hook` | Creating query or mutation hooks |
| `api-client` | Setting up the HTTP layer, `AppError`, and the query-key registry |
| `rhf-form` | Building forms with react-hook-form + zod |
| `routing` | Setting up React Router v7, protected routes, lazy loading |
| `zustand` | Client-side session state inside a feature |
| `error-handling` | `AppError`, error boundaries, and notification feedback |
| `i18n` | Adding translated copy, plurals, or locale-aware date/number/currency formatting |
| `testing` | Writing or fixing tests for specified files, or recently changed files |
| `storybook` | One story file per `shared/ui` primitive, plus one story for a feature's public entry |
| `browser-debug` | UI verification and debugging via Chrome |
| `code-review` | Reviewing a diff against the applicable rules and the originating spec |
| `manage-feature` | Flagging a feature, turning a flag on or off, or removing a feature and its leftovers |

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

- **Templates** → `skills/{skill-name}/examples.md` when that file exists
- **References** → `skills/{skill-name}/references/`

## Stack assumptions

React 19 + React Compiler · TypeScript strict · Vite + `import.meta.env` (SPA, no RSC) ·
shadcn/ui + Tailwind · `react-hook-form` + `zod` · `@tanstack/react-query` v5 · `ky` via
`shared/api` · React Router v7 · Zustand · `react-i18next` · Vitest + RTL · Storybook CSF3.

Cursor attaches `.mdc` rules from the table above. Claude Code does not load `.mdc` rules
(`rules` in `plugin.json` is a Cursor mechanism), so `code-review` reads the matching rule files
explicitly: `rules/general-coding-principles.mdc`, `rules/typescript.mdc`, `rules/react.mdc`,
`rules/styling.mdc`, `rules/shadcn.mdc`, `rules/i18n.mdc`, `rules/testing.mdc`, and
`rules/honesty.mdc`.

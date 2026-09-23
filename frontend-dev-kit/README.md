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

Auto-apply when editing matching files. `honesty` is the only rule with `alwaysApply: true`.
The others attach only when a matching file is in context.

| Rule | When it attaches | Topic |
|------|------------------|-------|
| `honesty` | Every session (`alwaysApply`), and `**/*.{ts,tsx,md}` | Verify library APIs before generating code; flag uncertainty; never fake a passing test |
| `general-coding-principles` | `**/*.{ts,tsx}` | Naming, function design, functional style, magic values, quality bar |
| `typescript` | `**/*.{ts,tsx}` | Interfaces vs types, strictness, narrowing, utility types, explicit public signatures |
| `react` | `**/*.tsx` | Purity, hooks, state ownership, effects, keys, memoization under the Compiler, refs, boundaries |
| `component-structure` | `**/features/**/ui/**`, `**/widgets/**/ui/**`, `**/entities/**/ui/**`, `**/shared/ui/**` (`*.ts`, `*.tsx`) | Kebab-case component folders and files (`button.tsx`, `custom-button.tsx`); PascalCase export |
| `styling` | `**/*.styles.{ts,tsx}` | What belongs in a component's `*.styles.ts(x)` file versus the component file |

A typical `.tsx` edit under `features|widgets|entities/**/ui/` or `shared/ui/` loads `honesty`,
`general-coding-principles`, `typescript`, `react`, and `component-structure`. A `*.styles.ts`
edit loads `honesty`, `general-coding-principles`, `typescript`, and `styling`. A plain `.ts`
module loads `honesty`, `general-coding-principles`, and `typescript`.

### Skills

Workflow guides with few-shot templates in each skill's `examples.md`.

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
| `storybook` | Component stories colocated with the component |
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

- **Skills** → `skills/{skill-name}/examples.md` (full scenario templates)
- **References** → `skills/{skill-name}/references/` (advanced patterns)

## Stack assumptions

React 19 + React Compiler · TypeScript strict · Vite + `import.meta.env` (SPA, no RSC) ·
shadcn/ui + Tailwind · `react-hook-form` + `zod` · `@tanstack/react-query` v5 · `ky` via
`shared/api` · React Router v7 · Zustand · `react-i18next` · Vitest + RTL · Storybook CSF3.

Cursor attaches `.mdc` rules from the table above. Claude Code does not load `.mdc` rules
(`rules` in `plugin.json` is a Cursor mechanism), so `code-review` reads the matching rule files
explicitly: `rules/general-coding-principles.mdc`, `rules/typescript.mdc`, `rules/react.mdc`,
and `rules/honesty.mdc`.

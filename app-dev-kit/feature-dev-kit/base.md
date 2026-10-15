# Feature Factory — Stack Reference

> **Historical (2026-07).** Pipeline, agents, packets, and human gates live in
> [`skills/feature-dev/references/pipeline-flow.md`](skills/feature-dev/references/pipeline-flow.md).
> Do **not** follow `AskUserQuestion` on workers or a `push-branch` skill from this file — those were superseded.

**Reference template**: iv-frontend (this repository)
**Architecture target**: Feature-Sliced Design (FSD)
**UI target**: shadcn/ui (Radix + Tailwind + CVA), added via the shadcn MCP server

## Stack — Inherited vs. Target (§0.1)

| Dimension | Inherited from template (keep) | Target for generation (adopt) |
|-----------|-------------------------------|-------------------------------|
| Language | TypeScript 5.7+, strict, no `any` | same |
| Framework | React 19 (function components, hooks, compiler) | same |
| Build/Test | Vite 6, Vitest 3 + RTL, `rendererRTL` wrapper | same |
| Data fetching | TanStack Query 5 hooks per domain, `queryHandler`, `apiRequest` | same, re-homed into FSD `entities/*/api` |
| Forms | React Hook Form 7, typed `useForm` | same |
| **Architecture** | layered (`pages/containers/components/api/utils`) | **Feature-Sliced Design** (see pipeline-flow.md) |
| **UI primitives** | Ant Design 5 | **shadcn/ui** (Radix + Tailwind + CVA) via shadcn MCP |
| **Styling** | styled-components 6, `theme.color.*`, rem | **Tailwind + CVA + shadcn tokens** |
| Conventions | named exports, `: JSX.Element`, colocated `.tsx` / `.styles` / `.test` / `index.ts`, no comments, `ENV` proxy, `isErrorResponse` guard | `{component}/{name}.tsx` + `styles.ts` + `tests/{name}.test.tsx` + `index.ts`; nested components in `ui/`; server entities use zod in `api/schema.ts` (invalid body notifies and returns `null`) instead of `isErrorResponse`. `TextContent` string maps replaced by react-i18next locales |

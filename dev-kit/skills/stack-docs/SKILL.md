---
name: stack-docs
description: Fetches current library documentation via Context7 MCP for React, TypeScript, antd, vanilla-extract, and react-query. Use when implementing features, debugging API usage, or when docs may have changed since training data.
---

# Stack Docs (Context7)

Use the **context7** MCP server to fetch up-to-date documentation for the dev-kit stack.

## When to use

- Setting up or configuring React, antd, vanilla-extract, or react-query
- Uncertain about API syntax, hook options, or component props
- User asks "how do I..." for a library in the stack
- Generated code may be outdated — verify against current docs first

## Stack libraries to resolve

| Library | Typical `libraryName` |
|---------|----------------------|
| React | `react` |
| TypeScript | `typescript` |
| antd | `antd` |
| vanilla-extract | `@vanilla-extract/css` |
| react-query | `@tanstack/react-query` |

## Workflow

1. Call `resolve-library-id` with the library name and the user's question
2. Pick the best match (official package, correct version if specified)
3. Call `query-docs` with the library ID and specific question
4. Apply the fetched docs when implementing — prefer doc examples over training data

## Guidelines

- Pass the user's full question as the query for better results
- When the user mentions a version (e.g. "antd 5", "react-query v5"), prefer version-specific library IDs
- Fetch docs before writing unfamiliar API code — especially mutations, Form APIs, and vanilla-extract recipes

See [examples.md](examples.md) for few-shot scenarios.

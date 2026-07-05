---
name: browser-debug
description: Debug and verify React UI in the browser via Chrome DevTools MCP. Use when testing UI behavior, inspecting DOM/CSS, checking console errors, or validating implemented features in a running app.
---

# Browser Debug (Chrome DevTools)

Use the **chrome-devtools** MCP server to connect to a running Chrome browser and verify React UI.

## Prerequisites

1. Chrome 144+ with remote debugging enabled: `chrome://inspect/#remote-debugging`
2. Dev server running (e.g. `npm run dev`)
3. Approve the remote debugging permission dialog when Cursor connects

## When to use

- Verify a component renders correctly after implementation
- Debug layout, styling, or antd component behavior in the browser
- Inspect console errors, network requests, or failed API calls
- Take snapshots or screenshots to compare against expected UI
- Reproduce and diagnose user-reported UI bugs

## Workflow

1. Ensure the app is running and the target page is open in Chrome
2. Use MCP tools to connect (auto-connect via `--autoConnect` config)
3. **Navigate** to the relevant URL if needed (`navigate_page`)
4. **Snapshot** the page to understand DOM structure (`take_snapshot`)
5. **Inspect** console messages and network requests for errors
6. **Interact** with elements (click, fill forms) to test behavior
7. Report findings and fix issues in code

## Common tools

| Goal | Tool |
|------|------|
| See page structure | `take_snapshot` |
| Visual check | `take_screenshot` |
| JS errors | `list_console_messages` |
| API failures | `list_network_requests` |
| Test interaction | `click`, `fill`, `fill_form` |
| Navigate | `navigate_page` |

## Guidelines

- Prefer browser verification after implementing visible UI changes
- Check console for React warnings and uncaught errors
- Do not use browser automation when a code-only fix is sufficient
- Ask the user to enable remote debugging if connection fails

See [examples.md](examples.md) for few-shot scenarios.

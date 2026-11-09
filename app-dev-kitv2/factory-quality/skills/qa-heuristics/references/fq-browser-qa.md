# Driving the running app — start, browser, API

## Start the app

1. Find the start command in the project's README or `package.json` scripts (`dev`, `start`,
   `preview`), per role folder when roles have their own path. Use the package manager the project
   uses (lockfile). Never install packages — the guard denies it.
2. Start it in the background (the Bash tool's background mode, or
   `nohup npm run dev > /tmp/<feature>-app.log 2>&1 &`) and note the process so you can stop it at
   the end.
3. Wait for the port: poll `curl -s -o /dev/null -w '%{http_code}' localhost:<port>` until it
   answers (give it up to a minute; read the log on failure).
4. A backend that needs a database: use the project's documented local stack (for example
   `docker compose up -d db` from the README) if it is there. If it cannot start, the charters that
   need it are `blocked` with the reason (the log line), and the others still run.
5. Only loopback hosts are reachable (`localhost`, `127.0.0.1`, `[::1]`): the guard denies other
   URLs for `curl` and `wget`, and you must not navigate the browser anywhere else either.
6. At the end, stop every process you started (`kill <pid>`; `docker compose stop` for what you
   started).

## The Playwright MCP browser

The browser is the `playwright` MCP server (it ships with frontend-dev-kit). The tools you have:

| Tool | Use |
|---|---|
| `mcp__playwright__browser_navigate` | open `http://localhost:<port>/<route>` |
| `mcp__playwright__browser_snapshot` | the accessibility tree with element refs — read it before every click or type; it is also your screen-reader check |
| `mcp__playwright__browser_click` | click an element by the `ref` from the latest snapshot (and a short human description) |
| `mcp__playwright__browser_type` | type into a field by `ref`; `submit: true` presses Enter |
| `mcp__playwright__browser_fill_form` | fill several fields in one call |
| `mcp__playwright__browser_press_key` | Tab, Shift+Tab, Enter, Escape, ArrowDown — keyboard checks |
| `mcp__playwright__browser_wait_for` | wait for a text to appear or disappear, or a few seconds |
| `mcp__playwright__browser_resize` | the viewport widths 320, 768, 1024, 1440 |
| `mcp__playwright__browser_take_screenshot` | evidence; pass a `filename` such as `FEAT-001-DEF-001.png` and record the path the tool returns |
| `mcp__playwright__browser_console_messages` | errors and warnings after each step |
| `mcp__playwright__browser_network_requests` | the requests the page made and their status codes |

Loop per step: snapshot → act (click/type/key) → wait_for the expected text → snapshot again →
console messages. Refs change after each page update; never reuse a ref from an older snapshot.

A console error during a flow is a finding on its own when the user can see the effect, or S4
when they cannot. A request that returns 4xx/5xx during a happy path is at least S3.

If the browser tools are not available in this session (no `playwright` MCP server), drive UI
charters through what you have (`curl` for the HTML and the API) and mark the UI-only checks
(keyboard, viewport, visual) as not covered in the QA report. A charter that could do nothing
useful is `blocked`.

## Driving an API

- `curl -s -i localhost:<port>/api/v1/<resource>`: status line, headers and body in one output.
- Authenticated calls: obtain a token the way the README or the stories describe (register + login
  endpoints, a seed user from the project's seed or example files). Never use real credentials.
- Problem responses: check `content-type: application/problem+json`, `status`, `code` and that no
  stack trace or SQL appears.
- Concurrency: run two calls in one command, `curl … & curl … & wait`.

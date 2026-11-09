# shadcn primitives in a factory task

Button, Input, Select, Dialog, Table, Skeleton, Alert and every other control the shadcn registry
provides are a `shared/ui/<name>/` base, used through `@/shared/ui/<name>`. The rules for the base
itself are `frontend-dev-kit` `rules/shadcn.mdc` and the `shadcn-usage` skill (load it when T1 lists
it). This file adds what is specific to one factory task: the MCP sequence, the write scope, and the
dependency rule.

## 1. Is the base already there?

Glob `src/shared/ui` (scoped). If `shared/ui/<name>/` exists, compose it and stop here — never a
second dialog, button or drawer. If it is missing:

- its files are in T0's list (a `component` task in `shared`) → add it (§ 2);
- they are not → you are composing above `shared`: return `blocked`
  (`"<name> missing in shared/ui"`), so the planner adds the base task.

## 2. The MCP sequence

On Cursor the call is the bare tool name (`search_items_in_registries`, and the same for the three calls below). `mcp__shadcn__…` is the Claude name for that call.

1. `mcp__shadcn__search_items_in_registries` — query the control by what it does
   (`"combobox"`, `"date picker"`). Pick the registry item, not a look-alike.
2. `mcp__shadcn__view_items_in_registries` — read the item: its files, `dependencies` and
   `registryDependencies`. Check every npm dependency against `package.json` (§ 4) and every
   registry dependency against `shared/ui` (§ 1) **before** you write anything.
3. `mcp__shadcn__get_item_examples_from_registries` — the `<name>-demo` example. The part order and
   nesting of the demo is how you compose it (`DialogContent` → header → body → footer).
4. `mcp__shadcn__get_add_command_for_items` — the CLI command for the project's `components.json`.
   Run it only when step 2 found every npm dependency already installed and the paths it writes are
   in your list; otherwise write the item's source by hand from step 2, verbatim.

## 3. Re-home verbatim

The base lands in `shared/ui/<name>/` exactly as the registry generated it: every part, prop,
`data-slot`, Radix import and class string, with the classes moved to `styles.ts` in the same order,
and only the edits `rules/shadcn.mdc` allows (comments and every `dark:` class deleted, kebab-case
files, closed-set constants in `constants.ts`, translated `sr-only` text). Delete a leftover copy
under `components/ui`. No `shared/ui/index.ts` barrel. A missing look is a new `cva` variant on the
base, never a call-site `className` with colour, radius, shadow or typography.

The convention check treats `shared/ui` differently: motion utilities and inline-handler rules do
not apply inside it, `dark-variant` does. Outside it, `raw-primitive` fails a raw `<button>`,
`<input>` or `<table>`.

## 4. A new npm package is human-owned

Never install a package (`pnpm add`, `npm install`, a CLI that adds dependencies): the hook denies
installs, `package.json` and the lockfile are not in your scope, and the dependency is a human
decision. When the item needs a package that is not installed, stop and choose one:

- **`needs_scope_change`** — the work cannot continue without it. Put one question in
  `open_questions` with everything the human needs:
  `"Approve @radix-ui/react-popover@^1.1.2 (MIT, ~9 kB gzip) for the coupon date picker (AC-0003)? It is the dependency of the shadcn popover item; the alternative is <what you would do without it>."`
- **record it for an HD note** — the task can finish without it (a native control is acceptable for
  now). Finish, and put the same package, version, licence, size and reason in
  `follow_up_suggested`, so the human can add it with `/factory:note`.

Find size and licence from the item's registry entry or Context7; write "unknown" rather than guess.

## 5. Record the decision

Say in the summary which bases you reused, which you added from the registry, and any you had to
hand-write (with the reason the registry had no match).

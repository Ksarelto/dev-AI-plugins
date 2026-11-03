# Design principles — review checklist

Applies to every changed file, not only components (`design.md` covers the component file). Report a
violation only when the diff introduces or worsens it, names the principle, and shows the concrete
cost. A principle never overrides a documented rule in `rules/`; where they conflict, the rule wins.

## SOLID at module level

- **Single responsibility.** A module has one reason to change. Smells: a hook that fetches, maps,
  validates, and navigates; a `models/` file that formats copy; a slice `lib/` that knows a screen.
- **Open/closed.** A new case is a new map entry, a `cva` variant, a fields-array item, or a new
  function — not another `if`/`switch` branch in a stable function. Flag a second `switch` on the
  same discriminant.
- **Liskov.** A wrapper of a primitive keeps the primitive's props and ref contract; it does not
  narrow or silently ignore them.
- **Interface segregation.** Props and parameters are what this caller uses. A component taking a
  whole `Order` to read `order.id` takes `orderId`. A hook returning 12 values for 3 consumers is
  too wide.
- **Dependency inversion.** Higher layers depend on a slice's public `index.ts`, never on its
  internals. A helper takes the fetcher, clock, or data as an argument; it does not import them.

## Coupling and cohesion

- Import direction `app → pages → widgets → features → entities → shared`. Any upward or sideways
  import is a violation (see `architecture.md`).
- **Law of Demeter.** `a.b.c.d` through another slice's data shape means the caller knows too much.
  Expose a selector or a mapped value from the owner.
- **Information expert.** The rule lives next to the data it uses: availability in the entity's
  `model/`, not re-derived in two components.
- **Temporal and connascence smells.** Two files that must change together in lockstep (a key
  string repeated, a parallel array of ids and labels) need one source.
- **Shared kernel creep.** `shared/` containing a business noun (`orderStatus`) is a misplaced
  entity or feature.

## Simplicity

- **KISS.** The straightforward version wins over a clever one. A generic `<DataThing<T, K>>` with
  one use is a finding.
- **YAGNI.** An option, prop, parameter, or abstraction with no caller in the diff. Speculative
  generality: an interface with one implementation and no test seam; a factory that returns one thing.
- **DRY, with the rule of three.** Duplicated *knowledge* (a rule, a mapping, a key) is a finding on
  the second copy. Two lookalike JSX blocks with different reasons to change are not.
- **Composition over inheritance and over configuration.** Many boolean props that switch layout
  (`isCompact`, `withIcon`, `isDanger`) mean the component should take `children`, a slot, or a
  `cva` variant.

## Separation of concerns

- UI renders; hooks wire; `models/` decides; `api/` talks to the server (`rules/react.mdc`,
  `rules/api-contract.mdc`). A rule found in JSX, a fetch found in a component, or a `t()` call in
  `models/` is a layer leak, not a style issue.
- Server state in the query cache, client state in the smallest owner, derived state computed.
  Mirroring one into another is a violation (`rules/react.mdc`).
- Side effects at the edge: handlers and effects, never the render body, never module scope.

## Code smells (Fowler) — judgement calls

A documented standard overrides a smell. Skip what a script already listed.

- **Mysterious Name** — rename it.
- **Duplicated Code** — same shape, not only the text `scan-duplicates.mjs` caught.
- **Long Function / Large Component** — extract by responsibility, not by line count.
- **Feature Envy** — move the method onto the data it uses.
- **Data Clumps** — bundle the fields that always travel together.
- **Primitive Obsession** — give the domain concept a type (`OrderStatus` union, not `string`).
- **Repeated Switches** — one map, or polymorphism by component.
- **Shotgun Surgery** — gather what changes together.
- **Divergent Change** — split a module that changes for several reasons.
- **Speculative Generality** — delete the unused abstraction.
- **Message Chains** — hide `a.b().c().d()` behind one function.
- **Middle Man** — call the real target; drop a wrapper that only forwards.
- **Boolean flag arguments** — two functions or a union beat `fn(x, true)`.
- **Temporary field / optional-field drift** — model with a discriminated union.

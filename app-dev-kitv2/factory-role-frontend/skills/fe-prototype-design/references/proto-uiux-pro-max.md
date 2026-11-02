# ui-ux-pro-max (optional)

`ui-ux-pro-max` is a third-party design-intelligence skill (MIT,
`nextlevelbuilder/ui-ux-pro-max-skill`): a CSV rule database with a stdlib-only Python search script.
The factory does not install it and does not need it. When it is already on the machine, the
designer may use it for **UX guidance per page type** and, only for slots no binding input fills, a
palette or layout suggestion. It never overrides a binding value, and its visual flourishes
(signature effects, motion presets, gradients, dark themes) are out of scope for this prototype.

## Is it there?

One Bash call, no installs, no network:

```bash
for d in .claude/skills/ui-ux-pro-max "$HOME/.claude/skills/ui-ux-pro-max" .cursor/skills/ui-ux-pro-max \
  "$HOME/.cursor/skills/ui-ux-pro-max" .agents/skills/ui-ux-pro-max "$HOME/.agents/skills/ui-ux-pro-max"; do
  [ -f "$d/scripts/search.py" ] && echo "$d" && break
done; command -v python3
```

No path printed, or no `python3` → it is not available. Write `ui-ux-pro-max: not found` in the
brief's provenance, leave it out of `design_sources`, and design from the neutral defaults and the
composition lines in [proto-design-brief.md](proto-design-brief.md). Never install it (the hook
denies package installs; it is a human decision) and never suggest the prototype is worse without it.

## Queries worth running

Keep it to what this prototype uses. `S` is the path found above plus `/scripts/search.py`.

| Purpose | Command | Feeds |
|---|---|---|
| UX rules for a page type this feature adds | `python3 "$S" "<page type> <domain>" --domain ux -f markdown` | the brief's composition lines |
| Palette for open slots (no binding colour) | `python3 "$S" "<domain> <audience>" --domain color -f markdown` | `--primary` and its pair, if you choose to |
| Layout archetype hint | `python3 "$S" "<domain> navigation" --domain ux -f markdown` | sidebar or top-nav |

Domain names differ between versions of the database: if `search.py` rejects one, run
`python3 "$S" --help` once and use the listed name. Run at most one query per distinct page type
plus one palette query, in one Bash call. A query that
fails is retried once, then dropped (note it). Keep raw output out of the brief: record the decision
and the query.

## Applying the output

- A UX rule becomes one line in the brief's composition section, phrased with the kit's classes
  (`filter-bar` with search first, then `chip`s).
- A palette hex becomes a derived token only when no binding colour exists; run the contrast check
  in [proto-tokens.md](proto-tokens.md) and adjust a derived colour until it passes. Set
  `design_authority: derived`.
- Ignore rows that need motion, gradients, glass, a chart library, an icon font or dark mode.

## Recording it honestly

- Used → add `ui-ux-pro-max (<the queries>)` to `design_sources` and the brief's provenance.
- Found but not used (binding inputs covered everything, or nothing relevant came back) → say so in
  the provenance; leave it out of `design_sources`.
- Never write that a value or rule came from ui-ux-pro-max when the query did not run or returned
  nothing. A fabricated source is worse than none: the human at GATE-P trusts the provenance line.

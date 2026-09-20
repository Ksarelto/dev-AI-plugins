# Artifact Naming — feature-dev-kit

Every artifact a feature run produces is derived from **one** value: the slug. Deriving it once, at
Station 0, is what lets a resumed run find its own files.

---

## The slug

| Rule | Value |
|------|-------|
| Charset | `[a-z0-9-]` only |
| Separator | single hyphen; no leading/trailing/double hyphens |
| Length | 3–40 characters |
| Shape | `<verb>-<object>` where the feature is an action; `<object>` where it is a screen |
| Uniqueness | must not collide with an existing `.spec/features/*.md` unless resuming |

### Derivation order

1. **Explicit argument** — `/feature-dev decline-profile` → normalize and use it.
2. **`SLUG_HINT`** — orchestrator-kit kebab of the screen or screen-less story title. Use this
   before any app-level slug. Required when `SCREEN_REF` is empty.
3. **Screen-task** — if `SCREEN_REF` / task title is present, slug from the **screen**
   (`Sign in` → `sign-in`), not from the app spec's `metadata.slug`. One blackboard per
   screen-task; the app slug stays on `.spec/app/spec-*/`.
4. **From the request text** — take the primary verb + primary business noun.
   `"reviewers should be able to decline a profile with a reason"` → `decline-profile`.
5. **Collision** — append the smallest integer suffix: `decline-profile-2`.

Cross-kit identity for the *app* still uses `metadata.slug` on the upstream spec and prototype
folder. Feature slugs are allowed to differ so 25 screens do not share one blackboard.

### Normalization

```
lowercase → strip accents → non-alphanumeric to hyphen → collapse hyphens → trim hyphens → truncate 40
```

Drop filler words (`the`, `a`, `add`, `new`, `feature`, `page`, `support`, `ability`) *before*
truncating — `add-the-new-profile-decline-feature` should become `decline-profile`.

---

## Derived artifacts

| Artifact | Pattern | Example |
|----------|---------|---------|
| Blackboard spec | `.spec/features/<slug>.md` | `.spec/features/decline-profile.md` |
| Git branch | `feature/<TICKET>-<slug>` or `feature/<slug>` | `feature/IV-1423-decline-profile` |
| Commit subject | `[<TICKET>] <imperative summary>` | `[IV-1423] Add profile decline flow` |
| PR title | same as commit subject | — |
| FSD feature slice | `src/features/<slug>/` | `src/features/decline-profile/` |
| FSD entity slice | `src/entities/<singular-noun>/` | `src/entities/profile/` |
| FSD page slice | `src/pages/<slug>/` | `src/pages/profile-review/` |

The ticket comes from the request text or the branch already checked out; when there is none, omit
that segment rather than inventing a placeholder. Branch and commit conventions are owned by
`../../../rules/git-workflow.mdc` — this file only fixes the *slug* they interpolate.

---

## Naming inside a slice

| Thing | Convention | Example |
|-------|-----------|---------|
| Component file | `PascalCase.tsx`, colocated in its own folder | `ui/DeclineProfileModal/DeclineProfileModal.tsx` |
| Test file | sibling `.test.tsx` | `ui/DeclineProfileModal/DeclineProfileModal.test.tsx` |
| Hook | `use<Thing>.ts`, camelCase | `model/useDeclineProfileForm.ts` |
| Query/mutation hooks file | `<slice>.hooks.ts` | `api/profile.hooks.ts` |
| Query keys | `<slice>.queryKeys.ts` | `api/profile.queryKeys.ts` |
| Types | `<slice>.model.ts` or `types.ts` | `model/profile.model.ts` |
| Public API | always `index.ts` | `features/decline-profile/index.ts` |
| Text keys | `SCREAMING_SNAKE` in `shared/config/textContent.ts` | `TextContent.DECLINE_PROFILE_TITLE` |

Entity slices are **singular** (`entities/profile`, not `entities/profiles`) — the slice names the
concept, not the collection.

---

## Anti-patterns

| ❌ | Why |
|---|-----|
| Timecoded feature folders | A feature is resumed and revised in place; history lives in git, not in folder names |
| Slug that names the layer (`profile-feature`, `profile-page`) | The path already says the layer; the slug says the intent |
| Renaming the slug mid-run | Every derived artifact silently orphans — start a new run instead |
| Slug drift between kits | `/generate-spec`, `/generate-html`, and `/feature-dev` must agree, or cross-kit lookups fail |

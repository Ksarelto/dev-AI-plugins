On-demand recipe. Read this file only when the skill that owns it tells you to. The matching rule under `rules/` is the constraint list and is already attached by glob — do not read it again.


# UI Quality Bar

The standard every screen the factory produces must meet: it should read as built by a design-aware
engineer, not generated. Applied by `features-engineer` and `composition-engineer` while building,
and checked by `code-reviewer` at Station 10.

Accessibility requirements live in `accessibility.mdc`; token and variant mechanics live in
`styling-conventions.mdc`. This file owns **composition, state coverage, and visual judgement**.

---

## Avoid the Generated Look

Autonomous UI has recognisable tells. Each one is a shortcut that ignores the design system.

| Tell | Why it is wrong | Instead |
|------|-----------------|---------|
| Purple/indigo gradients | A default palette that makes every app look identical | The project's semantic tokens only |
| `rounded-2xl` on everything | Real designs have a radius *hierarchy* — cards, inputs, and badges differ | The radius scale from the token set |
| Uniform card grids | A layout shortcut that ignores information priority | Layout driven by what the user scans for first |
| Oversized padding everywhere | Equal generous spacing destroys hierarchy and wastes viewport | The spacing scale, tightened where density matters |
| Layered drop shadows | Depth competing with content; slow on low-end devices | Flat, or the one elevation the design system defines |
| Lorem-style placeholder copy | Hides wrapping and overflow bugs that real strings expose | Realistic strings from `TextContent` |
| A hero section on an internal tool | Template thinking, not content thinking | Start with the data the user came for |

**No arbitrary values.** `p-[13px]`, `mt-[2.3rem]`, and `#4f46e5` are all rejections at review — if
the scale has no value that works, the design needs a decision, not an escape hatch.

---

## Composition over Configuration

```tsx
// ✅ Composable — the consumer controls structure
<Card>
  <CardHeader><CardTitle>{TextContent.PROFILES}</CardTitle></CardHeader>
  <CardContent><ProfileList profiles={profiles} /></CardContent>
</Card>

// ❌ Over-configured — every new need adds another prop
<Card title={TextContent.PROFILES} headerVariant="large" bodyPadding="md" content={<ProfileList … />} />
```

A prop that only exists to toggle a piece of markup should be a child instead. When a component
grows past ~200 lines or takes more than ~8 props, split it.

---

## Container / Presentation Split

Data fetching and rendering are separate components. The presentational half must be renderable from
props alone — that is what makes it testable and reusable across slices.

```tsx
// widgets/profile-review-panel/ui/ProfileListContainer.tsx — owns data + states
export const ProfileListContainer = (): JSX.Element => {
  const { data, isPending, isError, refetch } = useProfiles()

  if (isPending) return <ProfileListSkeleton />
  if (isError) return <ErrorState message={TextContent.PROFILES_LOAD_FAILED} onRetry={refetch} />
  if (data.length === 0) return <EmptyState message={TextContent.NO_PROFILES} action={…} />

  return <ProfileList profiles={data} />
}

// entities/profile/ui/ProfileList.tsx — owns rendering only
export const ProfileList = ({ profiles }: ProfileListProps): JSX.Element => (
  <ul role="list" className="divide-y divide-border">
    {profiles.map((profile) => <ProfileItem key={profile.id} profile={profile} />)}
  </ul>
)
```

---

## Every State, Every Time

A component is not complete until all four states exist. A missing state is a bug, not a polish item.

| State | Requirement |
|-------|-------------|
| **Loading** | Skeleton matching the real layout — not a centred spinner, which causes layout shift |
| **Empty** | Icon + heading + one explanatory line + the primary action that resolves it |
| **Error** | What failed, in the user's words, plus a retry affordance. Never a raw error string |
| **Populated** | The happy path, tested with the longest realistic content, not "Test" |

Mutations add two more: **pending** (inputs and submit disabled, `disabled={isPending}`) and
**success** (a `role="status"` confirmation, and the dialog closes).

---

## State Management — Pick the Smallest Tool

```
useState              → UI state owned by one component
lifted state          → shared by 2–3 siblings
URL search params     → filters, pagination, tabs — anything worth sharing as a link
TanStack Query        → all server data; it is a cache, not client state
Context               → theme, auth, locale: read-often, write-rarely
Global store          → only when app-wide client state genuinely exists
```

Never mirror server data into `useState` — that creates two sources of truth that drift. Never prop-
drill more than three levels; restructure or lift to context instead.

---

## Responsive

Mobile-first, expanding upward. Verify at **320 · 768 · 1024 · 1440 px**.

```tsx
<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
```

Tables need a decision at small widths — horizontal scroll inside their own container, or a card
layout. Silent overflow of the page body is a defect.

---

## Perceived Speed

- Skeletons over spinners for content that has a known shape.
- Optimistic updates for actions the user expects to be instant (toggles, reorder, delete) — with
  the rollback path implemented, per `tanstack-query-v5.mdc`.
- Never block the whole screen on one slow query; scope loading to the region that is actually
  loading.

---

## Rationalizations

| Rationalization | Reality |
|---|---|
| "The design isn't final, so I'll skip styling" | Unstyled UI reads as broken at the human gate. Use the design system defaults. |
| "It's just a prototype" | Prototypes ship. `/generate-html` is the prototype; this is production. |
| "I'll make it responsive later" | Retrofitting responsive layout costs roughly 3× building it in. |
| "The empty state is unlikely" | Every list is empty on day one — that is a user's first impression. |
| "Accessibility is a nice-to-have" | It is a gate, and in many jurisdictions a legal requirement. |

---

## Review Checklist

- [ ] Loading, empty, error, and populated states all implemented and tested
- [ ] Mutations disable their inputs while pending and confirm on success
- [ ] No arbitrary pixel values, no raw hex colours, no off-scale spacing
- [ ] Components under ~200 lines and ~8 props
- [ ] Presentational components render from props alone
- [ ] Server data is not copied into local state
- [ ] Verified at 320 / 768 / 1024 / 1440 px
- [ ] Every user-facing string comes from `TextContent`
- [ ] Renders with no console errors or warnings

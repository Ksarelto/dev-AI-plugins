# Adoption

Strangler-pattern leftovers. Skip this topic unless a mixed tree exists (legacy folders beside FSD, or `domain/` / `application/` / `processes/` / `state/` still present).

## Evaluate

**Hard (new FSD paths)**

- New code under `src/features/**`, `src/entities/**`, `src/widgets/**` must already satisfy layer/segment rules — no "for now" deep imports from a migrated slice.
- `shared/api` (ky `httpClient`, query client, query-keys registry) should exist before many slices migrate; a migrated feature `api/` without it is a finding.
- Tests for a migrated slice sit in the new `tests/` folders (`api/tests/`, `hooks/tests/`, `models/tests/`), not left in a legacy `__tests__/` tree.

**Judgment (legacy paths)**

- Do not require a big-bang rewrite. Legacy folders frozen beside `app/` / `pages/` / `features/` is the expected strangler shape.
- `widgets/` may be absent until a second migrated route duplicates a composition — an empty ceremonial `widgets/` is a smell, not a missing layer.
- dependency-cruiser / deep-import ESLint as **warnings** for legacy paths and **errors** for `src/features/**` is the intended ramp. Track legacy-import count so it only goes down.
- Build `shared/api/realtime/` at the **first** real-time need (one stream), not the second.
- Formalize a second domain in the query-key registry when a second feature needs to invalidate another's key.
- Extract shared business logic into `models/` / `entities/` on the second real consumer, not on a schedule.

## How

```bash
ls src
find src -type d \( -name domain -o -name application -o -name processes -o -name containers \)
rg -n "from ['\"]@/features/" src --glob '!src/features/**' --glob '!src/pages/**' --glob '!src/widgets/**' --glob '!src/app/**'
```

If the only tree is already FSD-shaped, skip this topic and say so in Missing / skipped.

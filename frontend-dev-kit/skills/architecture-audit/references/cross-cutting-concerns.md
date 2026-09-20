# Cross-cutting concerns

Each concern has one home. Mechanism in `shared/`; content (permission ids, copy, flags as values) next to the owner.

## Evaluate

**Hard**

- Auth: `shared/lib/auth/` + provider in `app/providers/`. No `features/auth/`.
- Permissions: ids in `features/*/config/`; mechanism in `shared/lib/permissions/`.
- Flags: values in `shared/config/flags` seeded from `shared/config/env`. Flag **names** never in feature `config/`. Gate at `RequireFlag` or page `isEnabled()` — not in feature `models/`/`ui/`.
- Env: only `shared/config/env` (and `shared/api/config.ts` for the API base) reads `import.meta.env`.
- i18n strings: feature `locales/` + `shared/locales/common/`; mechanism `shared/lib/i18n/`.
- `models/` must not return user-facing translated strings — typed reasons only.
- Time/ids: `shared/lib/clock.ts`, `ids.ts`. `models/` receives them as parameters — no `Date.now()` / `crypto.randomUUID()` inline.
- Money: `entities/money/model/` once earned; formatting via i18n formatters.
- Feature-specific assets colocated in `features/{f}/ui/{component}/`, not dumped into `shared/assets/`.
- Realtime: one stream in `shared/api/realtime/`; per-feature consumers in `features/{f}/hooks/`.

**Judgment**

- Flag owner / removal date exist only as comments — absence is a smell, not a compile error.
- Magic permission strings in JSX instead of the permissions helper.

## How

```bash
ls src/features/auth 2>/dev/null
ls src/shared/lib src/shared/config
rg -n "import.meta.env" src --glob "!**/shared/config/**" --glob "!**/shared/api/config.ts"
rg -n "Date\.now\(|crypto\.randomUUID\(" src/features/*/models src/entities/*/model
rg -n "t\(|useTranslation" src/features/*/models src/entities/*/model
rg -n "isEnabled\(|flags\." src/features/*/models src/features/*/ui
```

Confirm `auth/` and `permissions/` are not collapsed. Confirm feature assets are not generic logos in `shared/assets/` that belong to one feature.

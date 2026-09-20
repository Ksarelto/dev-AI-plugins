# Cross-cutting concerns

Each concern has one home. Mechanism in `shared/`; content (permission ids, copy, flags as values) next to the owner.

## Evaluate

**Hard**

- Auth: `shared/lib/auth/` + provider in `app/providers/`. No `features/auth/`.
- Permissions: ids in `features/*/config/`; mechanism in `shared/lib/permissions/`. No raw role string literals in JSX.
- Flags: values in `shared/config/flags` seeded from `shared/config/env`. Flag **names** never in feature `config/`. Gate at `RequireFlag` or page `isEnabled()` — not in feature `models/`/`ui/`.
- Env: only `shared/config/env` (and `shared/api/config.ts` for the API base) reads `import.meta.env`.
- i18n strings: feature `locales/` + `shared/locales/common/`; mechanism `shared/lib/i18n/`.
- `models/` must not return user-facing translated strings — typed reasons only.
- Time/ids: `shared/lib/clock.ts`, `ids.ts`. `models/` receives them as parameters — no `Date.now()` / `crypto.randomUUID()` inline.
- Money: `entities/money/model/` once earned; formatting via i18n formatters. No ad-hoc `toFixed(2)` on currency.
- Feature-specific assets colocated in `features/{f}/ui/{component}/`, not dumped into `shared/assets/`.
- Realtime: one stream in `shared/api/realtime/`; per-feature consumers in `features/{f}/hooks/`.
- Toasts: `shared/lib/notify` from `hooks/` / mutation callbacks / SSE owner — not from `models/` or `api/` fetchers.
- Analytics event names: `features/*/config/analytics.ts`, emitted through `shared/lib/analytics`.
- Third-party SDKs: thin wrapper in `shared/lib/{sdk}` or the feature's `api/`. Vendor package not imported from `ui/` or `models/`.
- HTTP client consumed by feature/entity `api/` only.

**Judgment**

- Flag owner / removal date exist only as comments — absence is a smell. An env var still defaulting a flag to `true` past its removal date is a finding.
- Magic permission strings in JSX instead of the permissions helper.
- `console.log` on production paths; PII in analytics payloads.

## How

```bash
ls src/features/auth 2>/dev/null
ls src/shared/lib src/shared/config
rg -n "import.meta.env" src --glob "!**/shared/config/**" --glob "!**/shared/api/config.ts"
rg -n "Date\.now\(|crypto\.randomUUID\(" src/features/*/models src/entities/*/model
rg -n "t\(|useTranslation" src/features/*/models src/entities/*/model
rg -n "isEnabled\(|flags\." src/features/*/models src/features/*/ui
rg -n "notify\(|toast\(" src/features/*/models src/features/*/api src/entities/*/model
```

Confirm `auth/` and `permissions/` are not collapsed. Confirm feature assets are not generic logos in `shared/assets/` that belong to one feature.

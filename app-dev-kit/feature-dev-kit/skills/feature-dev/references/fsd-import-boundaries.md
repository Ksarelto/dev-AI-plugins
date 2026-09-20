# FSD Import Boundaries

The FSD boundary gate is deterministic: violations are hard failures, not review judgment.

---

## Import Matrix

Rows = source layer. Columns = target layer. ✅ = allowed, ❌ = forbidden.

| Source \ Target | `app` | `pages` | `widgets` | `features` | `entities` | `shared` |
|-----------------|-------|---------|-----------|------------|------------|---------|
| `app` | — | ✅ | ✅ | ✅ | ✅ | ✅ |
| `pages` | ❌ | — | ✅ | ✅ | ✅ | ✅ |
| `widgets` | ❌ | ❌ | ❌* | ✅ | ✅ | ✅ |
| `features` | ❌ | ❌ | ❌ | ❌* | ✅ | ✅ |
| `entities` | ❌ | ❌ | ❌ | ❌ | ❌* | ✅ |
| `shared` | ❌ | ❌ | ❌ | ❌ | ❌ | — |

\* Cross-slice imports within the same layer are forbidden. A widget may not import from another widget; a feature from another feature; an entity from another entity.

Additional rules:
- `shared` imports nothing above itself — no exceptions.
- `app` may import from all layers.
- Cross-slice imports always go through the target slice's `index.ts`. Deep internal imports are forbidden regardless of layer direction.

---

## Cross-Slice Import Rule

```ts
// CORRECT — always through index.ts
import { useGetProfile } from '@/entities/profile'

// FORBIDDEN — deep internal import
import { useGetProfile } from '@/entities/profile/api/profile.hooks'
```

The path after the slice root (e.g. `/api/profile.hooks`) is the internal segment. External code never references it.

---

## Linter: Steiger (Official FSD Linter)

Steiger is the primary boundary enforcement tool. Wire it into `yarn lint`.

```ts
// steiger.config.ts (project root)
import { defineConfig } from 'steiger'
import fsd from '@feature-sliced/steiger-plugin'

export default defineConfig([
  ...fsd.configs.recommended,
  {
    files: ['./src/**'],
    rules: {
      '@feature-sliced/fsd/no-cross-slice-public-api': 'error',
      '@feature-sliced/fsd/no-layer-imports-skipping': 'error',
      '@feature-sliced/fsd/no-public-api-sidestep': 'error',
      '@feature-sliced/fsd/no-segments-on-sliced-layers': 'error',
    },
  },
])
```

Add to `package.json` scripts:
```json
"lint:fsd": "steiger ./src",
"lint": "yarn eslint && yarn stylelint && yarn lint:fsd"
```

---

## Fallback: ESLint `import/no-restricted-paths`

If Steiger is not yet installed, enforce the critical boundaries with ESLint zones:

```jsonc
// .eslintrc (add to rules)
"import/no-restricted-paths": ["error", {
  "zones": [
    { "target": "./src/shared", "from": "./src/entities" },
    { "target": "./src/shared", "from": "./src/features" },
    { "target": "./src/shared", "from": "./src/widgets" },
    { "target": "./src/shared", "from": "./src/pages" },
    { "target": "./src/shared", "from": "./src/app" },
    { "target": "./src/entities", "from": "./src/features" },
    { "target": "./src/entities", "from": "./src/widgets" },
    { "target": "./src/entities", "from": "./src/pages" },
    { "target": "./src/features", "from": "./src/widgets" },
    { "target": "./src/features", "from": "./src/pages" }
  ]
}]
```

---

## Every Slice Must Have `index.ts`

A slice without `index.ts` is a gate failure. No exceptions. Build workers must create `index.ts` as the first file in every new slice before writing any internal segment files.

---

## Remediation Steps for Common Violations

| Violation | Fix |
|-----------|-----|
| Upward import (e.g. `shared` importing from `entities`) | Move the shared code down: extract the domain-agnostic part into `shared/lib/` and keep domain logic in `entities/` |
| Cross-slice import (`features/a` importing from `features/b`) | Extract the shared logic into `entities/` or `shared/`; neither feature should own the other |
| Deep internal import (`import X from '@/entities/profile/api/profile.hooks'`) | Add `X` to `entities/profile/index.ts` and update the import path to `@/entities/profile` |
| Missing `index.ts` in a slice | Create `index.ts` and explicitly re-export every public symbol |
| Wildcard re-export in `index.ts` | Replace `export * from './ui/X'` with named exports: `export { X } from './ui/X'` |

# Vendored Alpine.js

Phase 4 (html-generator-kit) replaced the unpinned `@3.x.x` jsdelivr CDN tags for Alpine.js and its
focus plugin with vendored, pinned builds, so Station 6.5's render check (and any offline
environment) never depends on network access or on whichever `3.x` release jsdelivr happens to
resolve that day.

| File | Package | Version | Source dist file | Date vendored |
|------|---------|---------|-------------------|----------------|
| `alpine.min.js` | `alpinejs` | 3.17.4 | `dist/cdn.min.js` | 2026-10-01 |
| `alpine-focus.min.js` | `@alpinejs/focus` | 3.17.4 | `dist/cdn.min.js` | 2026-10-01 |

Both are the `cdn.min.js` build (IIFE, self-initializing — the same build the jsdelivr `cdn.min.js`
URL served), not the ESM/CJS module build, so they work as plain `<script src="...">` tags exactly
like before.

## Upgrade instructions

1. Pick the new exact version (`npm view alpinejs version`, `npm view @alpinejs/focus version`).
2. In a throwaway directory: `npm init -y && npm install alpinejs@<version> @alpinejs/focus@<version> --no-save`.
3. Copy `node_modules/alpinejs/dist/cdn.min.js` → this directory's `alpine.min.js`, and
   `node_modules/@alpinejs/focus/dist/cdn.min.js` → `alpine-focus.min.js`.
4. Update the one-line version comment at the top of each file and the table above.
5. Delete the throwaway directory — never leave a `node_modules` install inside this kit.
6. Re-run `skills/generate-html/scripts/copy-runtime-assets.test.mjs` and `npm run test:html-kit`.

## Where these are copied

`scripts/copy-runtime-assets.mjs` copies both files to `{OUTPUT_DIR}/js/vendor/` for every
prototype. Pages load them as `../js/vendor/alpine.min.js` / `../js/vendor/alpine-focus.min.js`
(`index.html`: `js/vendor/...`), after `app.js`/`store.js`/`data.js`/`navigation.js`, same load
order as the old CDN tags.

---
name: dependencies
description: Dependency and versioning policy — evaluating a new package, lockfile discipline, semver, upgrade cadence, and pinning. Use when adding a dependency, upgrading one, or deciding how to version a published package. Applies to any language.
---

# Dependencies

## When to use

- Considering whether to add a new package.
- Upgrading a dependency (patch/minor/major) and deciding how to sequence it.
- Versioning your own published package/library.
- Deciding how to pin versions for production vs. a library's own declared deps.

## Adding a new dependency

Before adding one, check: is this solvable with a few lines of code, or does it pull in a maintenance burden and a supply-chain surface for one function? Prefer the standard library / existing dependencies over a new package for trivial needs.

When you do add one:

- Check it's actively maintained (recent commits/releases) and has a compatible license.
- Check its own transitive dependencies aren't excessive for what it does.
- Pin an exact version on first add — don't let the lockfile pick whatever's newest.

## Lockfiles

Always commit the lockfile (`package-lock.json`/`uv.lock`/`poetry.lock`/`go.sum`/etc.) — it's what makes a build reproducible. Never hand-edit it; regenerate via the package manager.

## Versioning (semver)

- **Patch** (`1.2.3` → `1.2.4`): bug fixes only, no API change.
- **Minor** (`1.2.0` → `1.3.0`): new functionality, backward-compatible.
- **Major** (`1.0.0` → `2.0.0`): breaking change — requires a migration note.

Follow this for your own published packages/libraries, not just when reading changelogs of others.

## Upgrade cadence

- Patch/minor upgrades: batch and apply regularly (e.g. weekly/bi-weekly) via automated PRs (Dependabot/Renovate) rather than manually, one at a time, whenever noticed.
- Major upgrades: schedule deliberately, read the changelog/migration guide first, and land in a dedicated PR — never bundled with an unrelated feature change.
- Security patches (see the `security` rule's `pip-audit`/`npm audit`/`trivy` CI step): apply out of band, don't wait for the next scheduled cadence.

## Pinning in production

Pin exact versions (not ranges) in what actually deploys — a range (`^1.2.0`) is fine for a library's declared dependencies, but the application's lockfile must resolve to exact versions so every environment builds identically.

# factory-adapter-github

Tells the app-dev-kitv2 engine how to deliver to GitHub with the `gh` CLI: push the feature branch,
open a draft PR with the body the release manager wrote, and read review comments for S9.

Dry-run by default: `08-delivery/ship.json` records the exact commands. To open real PRs, install
and authenticate `gh`, then set `delivery.dry_run: false` in `.factory/factory.config.yaml`.

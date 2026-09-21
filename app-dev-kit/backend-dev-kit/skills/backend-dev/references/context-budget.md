# Context budget — backend-dev

1. Never inline the app `spec.md` or prototype HTML into hub or worker prompts.
2. Workers receive **paths** and a section allowlist.
3. `import-upstream.mjs` writes the scoped blackboard; the hub reads that file.
4. Gate transcripts go to `.spec/.gate-log`, not stdout.
5. Size guard: do not paste more than ~20 lines from another kit.

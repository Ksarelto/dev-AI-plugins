# Evals

`npm run validate` checks that manifests and file structure are well-formed. It cannot tell you
whether a skill or agent's `description` actually gets picked for the task it's meant for — that's
what this directory checks.

## What it does

Each file in `cases/` is a suite of realistic user prompts paired with the skill (or agent) that
*should* win. `runner.mjs` loads every candidate's frontmatter for the plugin, scores each one
against a prompt by lexical overlap (name-token matches weigh 3x, description-token matches weigh
1x, common stopwords ignored), and checks that the expected candidate has the top score.

This is a cheap proxy for what a model does when it reads a list of descriptions and picks one — it
won't catch every real selection failure, and it can't verify what an *agent's system prompt*
produces once invoked. What it reliably catches:

- a description too generic or too narrow to match how people actually phrase the task
- two skills/agents in the same plugin with descriptions that overlap enough to be ambiguous
- a typo in a name that breaks discoverability entirely (score of 0)

A `WARN` means the expected candidate tied for the top score with something else — not a failure,
but a sign the two descriptions could be sharpened to be more distinct. A `FAIL` means the expected
candidate didn't win at all, or scored zero.

## Running

```bash
npm run eval
```

Exits non-zero if any case fails. Runs offline — no API key, no network calls.

## Adding cases

- **New skill or agent in an existing plugin**: add at least one case to that plugin's file in
  `cases/`. Phrase the prompt the way a user actually would — don't just restate the description in
  the same words, or the eval can't tell a real match from an accidental one.
- **New plugin**: add `cases/<plugin-name>.json` with one case per skill/agent:

  ```json
  {
    "plugin": "my-plugin",
    "source": "./my-plugin",
    "component": "skills",
    "cases": [
      { "prompt": "a realistic user request", "expect": "skill-name" }
    ]
  }
  ```

  `source` is the plugin's root path relative to the repo root (matches the `source` field in
  `marketplace.json`). `component` is `"skills"` or `"agents"`.

See [CONTRIBUTING.md](../CONTRIBUTING.md) for where this fits in the overall submission checklist.

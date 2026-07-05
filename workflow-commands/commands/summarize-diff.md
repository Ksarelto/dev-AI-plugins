---
name: summarize-diff
description: Summarize the current branch changes compared to the base branch in plain language
---

# Summarize Diff

Provide a concise summary of branch changes:

1. Determine the base branch (default: `main` or `master`)
2. Run `git diff <base>...HEAD --stat` and `git log <base>..HEAD --oneline`
3. Summarize in plain language:
   - What was added, changed, or removed
   - Why (infer from commit messages and code context)
   - Any files or areas with the most significant changes
4. Keep the summary under 200 words unless the diff is very large

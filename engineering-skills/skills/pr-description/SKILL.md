---
name: pr-description
description: Generate pull request descriptions from branch changes. Use when creating PRs, writing PR summaries, or when the user asks for a PR description.
---

# PR Description

## When to use

- Creating a new pull request
- Updating an existing PR description
- User asks for a PR summary or description

## Instructions

1. Compare the branch against the base branch (`git diff main...HEAD` or similar)
2. Review commit history on the branch
3. Write a PR description with these sections:

### Summary
1-3 bullet points explaining what changed and why.

### Test plan
Checklist of steps to verify the changes work correctly.

### Notes
Optional: breaking changes, migration steps, or follow-up work.

## Format

```markdown
## Summary
- Bullet point 1
- Bullet point 2

## Test plan
- [ ] Step to verify change 1
- [ ] Step to verify change 2
```

Keep it concise. Focus on reviewer needs, not implementation details.

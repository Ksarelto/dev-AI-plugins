---
name: commit-message
description: Write clear, conventional commit messages from staged changes. Use when creating git commits, amending commits, or when the user asks for a commit message.
---

# Commit Message

## When to use

- Creating a new git commit
- Amending an existing commit message
- User asks "write a commit message" or similar

## Instructions

1. Run `git diff --staged` (or `git diff` if nothing staged) to understand changes
2. Write a commit message following conventional commits:
   - Format: `type(scope): subject` then blank line then body
   - Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`
   - Subject: imperative mood, max 72 characters, no period
   - Body: explain what and why, not how
3. Focus on the "why" rather than listing every file changed

## Example

```
fix(auth): prevent token refresh race condition

When multiple tabs refresh simultaneously, only one request
should hit the refresh endpoint. Added mutex lock around
the refresh flow.
```

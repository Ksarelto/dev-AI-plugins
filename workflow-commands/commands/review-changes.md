---
name: review-changes
description: Review all uncommitted and staged changes for bugs, style issues, and improvements
---

# Review Changes

Review the current working tree changes:

1. Run `git diff` and `git diff --staged` to see all changes
2. For each changed file, check:
   - Logic errors and edge cases
   - Missing error handling
   - Naming and readability
   - Unnecessary complexity
3. Provide feedback grouped by severity:
   - **Critical**: must fix before committing
   - **Suggestion**: improvements worth considering
   - **Nit**: minor style or preference items
4. Do not make changes unless asked — review only

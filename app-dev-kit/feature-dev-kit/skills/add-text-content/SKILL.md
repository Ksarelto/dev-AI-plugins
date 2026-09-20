---
name: add-text-content
description: Add keys to shared/config text content and enums. Use whenever a slice needs a new user-facing string or enum value — no hardcoded UI strings allowed.
argument-hint: <KEY> "<value>"
disable-model-invocation: false
allowed-tools: [Read, Edit, Grep]
---

# Add Text Content

## When to use

Any build station that introduces user-facing strings or new enum values. Invoke before writing any component that displays text — no hardcoded strings are allowed in components. Used by all engineers.

## Steps

1. **Identify all user-facing strings** in the planned components: button labels, modal titles, placeholder text, success/error notification messages, empty-state text, validation error messages, navigation labels. List them before editing any file.

2. **Check for duplicates**: search the existing `TextContent` object (at `src/constants/textContent.ts` or `shared/config/textContent.ts` in the FSD layout) with `Grep` for the exact string value. If an identical string already exists under a different key, use the existing key — do not add a duplicate value.

3. **Add keys** to the `TextContent` constant:
   ```ts
   export const TextContent = {
     // existing entries...
     DECLINE_PROFILE_CONFIRM: 'Confirm Decline',
     DECLINE_PROFILE_SUCCESS: 'Profile declined successfully',
     DECLINE_PROFILE_REASON_PLACEHOLDER: 'Enter reason (optional)',
     DECLINE_PROFILE_MODAL_TITLE: 'Decline Profile',
   } as const
   ```
   Key naming rules: `UPPER_SNAKE_CASE`, namespaced by feature (`DECLINE_PROFILE_*`), action, then context (`CONFIRM`, `SUCCESS`, `ERROR`, `PLACEHOLDER`, `TITLE`, `LABEL`, `EMPTY`).

4. **Add enum values** (if introducing new status values, types, or categories):
   ```ts
   // src/enums/ProfileStatus.ts (or shared/config/enums/ProfileStatus.ts)
   export enum ProfileStatus {
     NEW = 'NEW',
     ACTIVE = 'ACTIVE',
     DECLINED = 'DECLINED',  // <-- new value
   }
   ```
   Enum value naming: `PascalCase` for the enum name, `UPPER_SNAKE_CASE` for the values (matching typical API string values).

5. **Reference via `TextContent.KEY`** in all components — never inline string literals:
   ```tsx
   // Correct
   <Button>{TextContent.DECLINE_PROFILE_CONFIRM}</Button>

   // Forbidden
   <Button>Confirm Decline</Button>
   ```

6. **Run `yarn typecheck`**: verify the new keys compile cleanly (TypeScript will catch typos in the `as const` object).

## Pre-conditions

- The `TextContent` file location is known (check `src/constants/textContent.ts` first; if FSD migration is underway, may be at `shared/config/textContent.ts`).

## Outputs

- `TextContent` object updated with new string keys.
- Enum files updated with new values (if applicable).

## What this skill does NOT do

- Does not translate strings or handle i18n.
- Does not write components — only adds the string constants they will use.
- Does not remove existing keys (removal may break other consumers — flag unused keys in the spec instead).

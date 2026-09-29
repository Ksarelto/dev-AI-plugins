---
name: add-text-content
description: Add keys to shared/config text content and enums. Use whenever a slice needs a new user-facing string or enum value — no hardcoded UI strings allowed.
argument-hint: <KEY> "<value>"
disable-model-invocation: false
allowed-tools: [Read, Edit, Grep]
---

# Add Text Content

Copy is **frontend-dev-kit:i18n** (`react-i18next`). Do not add a `TextContent` map.

## Steps

1. List every new user-facing string (labels, titles, placeholders, empty/error/success, nav).
2. Load `frontend-dev-kit:i18n` and add keys there. Reuse an existing key when the string already exists.
3. Status enums stay in the slice `model/`. This skill does not invent a second string table.

## What this skill does NOT do

- Does not write components.
- Does not remove existing keys.

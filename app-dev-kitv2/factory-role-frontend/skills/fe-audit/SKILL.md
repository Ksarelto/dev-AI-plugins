---
name: fe-audit
description: Procedure for the factory frontend auditor — run the role's audit scripts on the change set (raw colours instead of design tokens, user-visible strings outside i18n) and report each hit as a finding. Preloaded by fe-auditor; not for direct use.
user-invocable: false
---

# Frontend audit

1. Collect the `.tsx` / `.ts` / `.css` files from `06-verify/change-set.yaml` (skip test files).
2. Run, from the project root (`<role pack>` is this plugin's folder, two levels above this skill):

   ```bash
   node <role pack>/scripts/audit-raw-colours.mjs <files…>
   node <role pack>/scripts/audit-i18n.mjs <files…>
   ```

   Each prints a JSON array of `{ file, line, rule, text }`.
3. Report every hit as a finding:
   - `raw-colour` → `severity: P2`, `claim: "raw colour instead of a design token"`;
   - `untranslated-text` → `severity: P3` (P2 when the project uses i18next — the script says so).
4. No hits is a valid result: return an empty `findings` list.

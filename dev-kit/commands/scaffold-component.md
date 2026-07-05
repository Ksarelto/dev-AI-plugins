---
name: scaffold-component
description: Scaffold a React component folder with index.tsx, vanilla-extract styles, and types
---

# Scaffold Component

Create a new React component following dev-kit conventions.

## Steps

1. Ask the user for (or infer from context):
   - Component name (PascalCase)
   - Target path (e.g. `src/components/` or `src/features/users/components/`)
2. Read applicable rules: `react-components`, `typescript-react`, `vanilla-extract`
3. Read few-shot templates: `examples/rules/react-components.md`, `examples/rules/vanilla-extract.md`
4. Create the component folder:

```
{TargetPath}/{Name}/
├── index.tsx
├── {Name}.css.ts
└── types.ts
```

5. Generate files using these templates:

**types.ts:**
```ts
export interface {Name}Props {
  // define props
}
```

**{Name}.css.ts:**
```ts
import { style } from '@vanilla-extract/css';
import { vars } from '@/styles/tokens.css';

export const root = style({
  // component styles using tokens
});
```

**index.tsx:**
```tsx
import * as styles from './{Name}.css';
import type { {Name}Props } from './types';

export function {Name}({ /* destructure props */ }: {Name}Props) {
  return (
    <div className={styles.root}>
      {/* component content */}
    </div>
  );
}
```

6. If the component wraps antd, read `examples/rules/antd-usage.md` for the wrapper pattern
7. Export from parent barrel `index.ts` if one exists

Do not add tests or stories unless explicitly requested.

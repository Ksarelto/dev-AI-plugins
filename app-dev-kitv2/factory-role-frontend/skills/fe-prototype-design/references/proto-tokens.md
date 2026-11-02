# Prototype tokens (`css/tokens.css`)

`tokens.css` is the only place a colour, font, radius or spacing value of the living prototype is
written. Pages and `components.css` use `var(--token)` only. The token **names** are fixed: every
page of every earlier feature depends on them, so never rename or remove one; add a new name only
when a binding value has no home (and list it in the design brief).

## Fixed token names

| Group | Tokens |
|---|---|
| Surface and text | `--background --foreground --card --card-foreground --muted --muted-foreground --overlay` |
| Brand and action | `--primary --primary-foreground --primary-hover --secondary --secondary-foreground --accent --accent-foreground` |
| Feedback | `--success --success-subtle --warning --warning-subtle --destructive --destructive-foreground --destructive-subtle` |
| Lines and focus | `--border --input --ring` |
| Type | `--font-sans --font-display --text-xs --text-sm --text-base --text-lg --text-xl --text-2xl` |
| Shape | `--radius --radius-sm --radius-lg --shadow-sm --shadow-md` |
| Density | `--control-py --control-px --cell-py --cell-px --card-pad --main-pad-y --main-pad-x` |
| Layout | `--sidebar-width --topnav-height --content-max` |

There are no motion tokens and no `.dark` block: the prototype has one light theme and no motion
polish.

## Neutral light defaults

Used for every token no binding input sets (design authority `neutral`). Plain hex so a contrast
check is one command. The ratios are WCAG 2.x contrast ratios, computed.

```css
:root {
  --font-sans: system-ui;
  --font-display: system-ui;

  --background: #f8fafc;
  --foreground: #1f2937;
  --card: #ffffff;
  --card-foreground: #1f2937;
  --muted: #f1f5f9;
  --muted-foreground: #4b5563;
  --overlay: rgb(15 23 42 / 0.45);

  --primary: #2563eb;
  --primary-foreground: #ffffff;
  --primary-hover: #1d4ed8;
  --secondary: #f1f5f9;
  --secondary-foreground: #1f2937;
  --accent: #eff6ff;
  --accent-foreground: #1e40af;

  --success: #15803d;
  --success-subtle: #f0fdf4;
  --warning: #92400e;
  --warning-subtle: #fffbeb;
  --destructive: #b91c1c;
  --destructive-foreground: #ffffff;
  --destructive-subtle: #fef2f2;

  --border: #e2e8f0;
  --input: #6b7280;
  --ring: #2563eb;

  --text-xs: 0.75rem;
  --text-sm: 0.875rem;
  --text-base: 1rem;
  --text-lg: 1.125rem;
  --text-xl: 1.25rem;
  --text-2xl: 1.5rem;

  --radius: 0.5rem;
  --radius-sm: 0.25rem;
  --radius-lg: 0.75rem;
  --shadow-sm: 0 1px 2px rgb(15 23 42 / 0.06);
  --shadow-md: 0 4px 12px rgb(15 23 42 / 0.08);

  --control-py: 0.5rem;
  --control-px: 0.875rem;
  --cell-py: 0.625rem;
  --cell-px: 0.875rem;
  --card-pad: 1.25rem;
  --main-pad-y: 2rem;
  --main-pad-x: 2.5rem;

  --sidebar-width: 15rem;
  --topnav-height: 3.5rem;
  --content-max: 1120px;
}
```

The font tokens hold the family only; `base.css` adds the fallback stack
(`font-family: var(--font-sans), system-ui, sans-serif`). That keeps a provided family verbatim in
its token, which is what gate-proto greps for.

| Pair | Ratio | Needs |
|---|---|---|
| `--foreground` on `--background` | 14.03 | 4.5 text |
| `--muted-foreground` on `--card` / `--muted` | 7.56 / 6.90 | 4.5 |
| `--primary-foreground` on `--primary` | 5.17 | 4.5 |
| `--primary` (links) on `--background` | 4.94 | 4.5 |
| `--accent-foreground` on `--accent` | 8.01 | 4.5 |
| `--destructive` on `--destructive-subtle` | 5.91 | 4.5 |
| `--success` on `--success-subtle` | 4.79 | 4.5 |
| `--warning` on `--warning-subtle` | 6.84 | 4.5 |
| `--input` (control border) on `--card` | 4.83 | 3 non-text |
| `--ring` on `--card` | 5.17 | 3 non-text |

## Applying a binding value

Every row of the report's `binding` list is written into `tokens.css` as
`<token>: <value>;` with the value **exactly** as provided — same notation (hex, `rgb()`, `hsl()`,
`oklch()`), no conversion, no rounding, no case games. gate-proto checks each row with a
case-insensitive match of `token: value;`; a row whose token is listed in `deviations` is skipped.

| Provided | Token |
|---|---|
| primary / brand / main colour | `--primary` (then pick `--primary-foreground` and `--primary-hover`) |
| secondary colour | `--secondary` |
| accent / highlight | `--accent` |
| background / page colour | `--background` |
| surface / card colour | `--card` |
| text colour | `--foreground` |
| border colour | `--border` |
| success / warning / error colour | `--success` / `--warning` / `--destructive` |
| body font | `--font-sans` (the family as written, e.g. `'Inter'`) |
| heading font | `--font-display` |
| corner radius | `--radius` (and derive `--radius-sm`, `--radius-lg`) |

A provided value that is not valid CSS for its token (a Pantone name, "dark blue") is a deviation:
choose the nearest CSS value, record `provided`, the token and the reason.

## Contrast self-check (WCAG 2.2 AA)

Run it whenever a colour token changed, before you write the report:

```bash
node -e 'const L=h=>{const c=[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255).map(v=>v<=0.03928?v/12.92:((v+0.055)/1.055)**2.4);return 0.2126*c[0]+0.7152*c[1]+0.0722*c[2]};const r=(a,b)=>{const x=L(a),y=L(b);return ((Math.max(x,y)+0.05)/(Math.min(x,y)+0.05)).toFixed(2)};for(const p of process.argv.slice(1)){const [f,b]=p.split("/");console.log(p,r(f,b))}' '#ffffff/#0a3d62' '#1f2937/#f8fafc'
```

The script takes six-digit hex pairs `foreground/background`; convert another notation for the
check only (the token keeps the provided notation). Thresholds: 4.5:1 for text, 3:1 for large text
(≥ 24px, or ≥ 18.66px bold) and for control borders and the focus ring.

- A derived token you chose fails → change it until it passes.
- A **provided** colour is never changed to pass. Fix the pairing first: choose `#ffffff` or
  `#1f2937` as its foreground, whichever passes. If the provided colour still fails where it is
  used as text (links, a coloured label), keep it and add a deviation **without** a `token` field —
  `{ attribute: "Primary as link text", provided: "#5fa8d3", reason: "a11y-risk: 2.50:1 on #f8fafc; kept as provided, links underlined" }`
  — so the binding row is still checked and the human sees the risk at GATE-P.
- Write the pairs you checked and their ratios into the brief's contrast table.

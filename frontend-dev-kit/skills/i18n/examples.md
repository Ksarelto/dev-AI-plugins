# i18n Examples

Bad/Good pairs for the `i18n` skill.

## Hardcoded copy

```tsx
// Bad
<Button aria-label="Delete item">Delete</Button>

// Good
import { itemKeys } from '@/features/items/locales/keys';

const { t } = useTranslation();

<Button aria-label={t(itemKeys.actions.deleteAriaLabel)}>
  {t(itemKeys.actions.delete)}
</Button>
```

## Key files

```json
// features/users/locales/en.json
{
  "list": {
    "emptyState": "No users found",
    "title": "Users"
  }
}
```

```ts
// features/users/locales/keys.ts
import type { NestedKeysOf } from '@/shared/lib/i18n/keys';
import en from './en.json';

export const usersKeys = {
  list: {
    emptyState: 'list.emptyState',
    title: 'list.title',
  },
} as const satisfies NestedKeysOf<typeof en>;
```

```tsx
// Bad — raw sentence, or a raw key string, or src/locales/en/users.json
t('No users found');
t('list.emptyState');

// Good
t(usersKeys.list.emptyState);
```

Shared copy that more than one feature needs goes in `shared/lib/i18n/locales/common/`, not in another feature's `locales/`.

## Pluralization

```json
// features/orders/locales/en.json
{
  "itemCount_one": "{{count}} item",
  "itemCount_other": "{{count}} items"
}
```

```tsx
// Bad
count === 1 ? `${count} item` : `${count} items`;

// Good
t(orderKeys.itemCount, { count });
```

## Embedded markup with Trans

```json
{ "termsNotice": "I agree to the <link>Terms of Service</link>" }
```

```tsx
// Bad — sentence split around JSX
<>I agree to the <a href="/terms">Terms of Service</a></>

// Good
<Trans
  i18nKey={usersKeys.termsNotice}
  components={{ link: <a href="/terms" /> }}
/>
```

## Formatters

```tsx
// Bad — hand-built format, or Intl constructed in the component
`${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
new Intl.NumberFormat(locale, { style: 'currency', currency: order.currency }).format(order.total);

// Good — formatters from shared/lib/i18n/format.ts; currency code from the money value
const formatCurrency = useCurrencyFormatter();
formatCurrency(order.total, order.currency);
```

## RTL-safe layout

```tsx
// Bad — breaks in RTL locales
<div className="ml-4 text-left">

// Good — flips automatically with dir="rtl"
<div className="ms-4 text-start">
```

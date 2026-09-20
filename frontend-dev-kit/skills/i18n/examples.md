# i18n Examples

Bad/Good pairs for the constraints in the `i18n` rule.

## Hardcoded copy

```tsx
// Bad
<Button aria-label="Delete item">Delete</Button>

// Good
const { t } = useTranslation('items');

<Button aria-label={t('actions.deleteAriaLabel')}>
  {t('actions.delete')}
</Button>
```

## Key naming and namespace files

```json
// src/locales/en/users.json
{
  "list": {
    "emptyState": "No users found",
    "title": "Users"
  }
}
```

```tsx
// Bad — raw sentence as key, no namespace
t('No users found');

// Good
const { t } = useTranslation('users');
t('list.emptyState');
```

## Pluralization

```json
// en/orders.json
{
  "itemCount_one": "{{count}} item",
  "itemCount_other": "{{count}} items"
}
```

```tsx
// Bad
count === 1 ? `${count} item` : `${count} items`;

// Good
t('itemCount', { count });
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
  i18nKey="termsNotice"
  components={{ link: <a href="/terms" /> }}
/>
```

## Formatters

```tsx
// Bad — hand-built format, re-created every render
`${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;

// Good — built once per locale, memoized
const dateFormatter = useMemo(
  () => new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }),
  [locale],
);
dateFormatter.format(date);
```

```tsx
// Currency — code from data, formatting from locale
new Intl.NumberFormat(locale, { style: 'currency', currency: order.currencyCode }).format(order.total);
```

## RTL-safe layout

```tsx
// Bad — breaks in RTL locales
<div className="ml-4 text-left">

// Good — flips automatically with dir="rtl"
<div className="ms-4 text-start">
```

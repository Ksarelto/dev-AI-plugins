# React Component — Few-shot Examples

## Shared wrapper

```
shared/ui/pending-button/
├── pending-button.tsx
├── styles.ts
├── types.ts
├── index.ts
└── pending-button.test.tsx
```

```ts
// styles.ts
import { cn } from '@/shared/lib/utils';

export const root = (className?: string): string => cn('gap-2', className);
```

```tsx
// pending-button.tsx
import { Button } from '@/shared/ui/button';
import { Spinner } from '@/shared/ui/spinner';
import * as styles from './styles';
import type { PendingButtonProps } from './types';

export const PendingButton = ({
  className,
  pending = false,
  disabled,
  children,
  ...props
}: PendingButtonProps): JSX.Element => (
  <Button
    className={styles.root(className)}
    disabled={disabled || pending}
    {...props}
  >
    {pending && <Spinner />}
    {children}
  </Button>
);
```

```ts
// index.ts
export { PendingButton } from './pending-button';
```

`Spinner` is the registry item — no hand-rolled `Loader2` with `animate-spin`. No `export *`, no props-type re-export until an outside file imports it.

## Feature component with states

```tsx
// features/catalogue/ui/listing-list/listing-list.tsx
import { useTranslation } from 'react-i18next';
import { ListingCard } from '@/entities/listing';
import { useListings } from '../../hooks/use-listings';
import { catalogueKeys } from '../../locales/keys';
import { ListingListEmpty } from './listing-list-empty';
import { ListingListError } from './listing-list-error';
import { ListingListSkeleton } from './listing-list-skeleton';
import * as styles from './styles';

export const ListingList = (): JSX.Element => {
  const { t } = useTranslation();
  const { data, isPending, isError, refetch } = useListings();

  const handleRetry = (): void => {
    void refetch();
  };

  if (isPending) {
    return <ListingListSkeleton />;
  }

  if (isError) {
    return <ListingListError onRetry={handleRetry} />;
  }

  if (data.length === 0) {
    return <ListingListEmpty />;
  }

  return (
    <section
      className={styles.root}
      aria-label={t(catalogueKeys.list.label)}
    >
      {data.map((listing) => (
        <ListingCard
          key={listing.id}
          listing={listing}
        />
      ))}
    </section>
  );
};
```

Each state component (`listing-list-skeleton`, `listing-list-error`, `listing-list-empty`) is its own file in the folder with its own test. Error and empty copy come from `catalogueKeys`, and the error state uses `Alert` + `Button`.

## Bad → Good

```tsx
// Bad
<div className="flex gap-2">
  {isLoading ? <Loader2 className="animate-spin" /> : items.length ? <List items={items} /> : <p>No items yet</p>}
  <Button type="button" variant="outline" onClick={() => onClose(false)}>Cancel</Button>
</div>
```

That one line has an inline class, hand-rolled motion, a nested ternary, English copy, a default `type` literal, a variant literal, and an inline handler.

```tsx
// Good
const handleCancel = (): void => {
  onClose(false);
};

if (isLoading) {
  return <Spinner />;
}

if (items.length === 0) {
  return <ItemsEmpty />;
}

return (
  <div className={styles.root}>
    <List items={items} />
    <Button
      variant={ButtonVariant.Outline}
      onClick={handleCancel}
    >
      {t(commonKeys.actions.cancel)}
    </Button>
  </div>
);
```

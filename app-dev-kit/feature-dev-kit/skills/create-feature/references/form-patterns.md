On-demand recipe. Read this file only when the skill that owns it tells you to. The matching rule under `rules/` is the constraint list and is already attached by glob — do not read it again.


# Form Patterns

---

## File Location in FSD

| Concern | Segment | Example file |
|---------|---------|-------------|
| Form component + field layout | `features/<action>/ui/` | `DeclineProfileForm.tsx` |
| `useForm` instance, schema, submit handler | `features/<action>/model/` | `declineProfileForm.model.ts` |
| Pure validators (no RHF dependency) | `features/<action>/lib/` | `declineProfile.validators.ts` |
| Form-related types | `features/<action>/model/` | `declineProfileForm.types.ts` |

---

## Typed `useForm` Pattern

Always pass the schema-inferred type as the generic. Never use untyped `useForm()`.

```ts
// features/decline-profile/model/declineProfileForm.model.ts
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

const declineProfileSchema = z.object({
  reason: z.string().max(500).optional(),
})

export type DeclineProfileFormValues = z.infer<typeof declineProfileSchema>

export const useDeclineProfileForm = () =>
  useForm<DeclineProfileFormValues>({
    resolver: zodResolver(declineProfileSchema),
    defaultValues: { reason: '' },
  })
```

---

## shadcn Form + RHF Wiring

Use shadcn `Form`, `FormField`, `FormItem`, `FormControl`, `FormLabel`, `FormMessage` to connect RHF to inputs. Never build custom error display — `FormMessage` renders `fieldState.error.message` automatically.

```tsx
// features/decline-profile/ui/DeclineProfileForm.tsx
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/shared/ui/form'
import { Textarea } from '@/shared/ui/textarea'
import { Button } from '@/shared/ui/button'
import { useDeclineProfileForm, DeclineProfileFormValues } from '../model/declineProfileForm.model'
import { useDeclineProfile } from '@/entities/profile'

interface DeclineProfileFormProps {
  profileId: string
  onSuccess: () => void
}

export const DeclineProfileForm = ({ profileId, onSuccess }: DeclineProfileFormProps): JSX.Element => {
  const form = useDeclineProfileForm()
  const { mutate: declineProfile, isPending } = useDeclineProfile()

  const handleSubmit = form.handleSubmit((values: DeclineProfileFormValues) => {
    declineProfile({ profileId, ...values }, { onSuccess })
  })

  return (
    <Form {...form}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <FormField
          control={form.control}
          name="reason"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Reason (optional)</FormLabel>
              <FormControl>
                <Textarea {...field} disabled={isPending} placeholder="Enter reason..." />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={isPending}>
          Confirm Decline
        </Button>
      </form>
    </Form>
  )
}
```

---

## Submit → Mutation Flow

```
form.handleSubmit(values)
  → useMutation mutationFn: apiRequest.patch(apiMap.profiles.v1.decline(profileId), values)
  → onSuccess: queryClient.invalidateQueries({ queryKey: profileQueryKeys.all })
              notifySuccess(TextContent.PROFILE_DECLINED)
  → onError: if (isErrorResponse(error)) errorHandler(error)
```

Rules:
- `mutationFn` uses `apiRequest.patch/post/put/delete` — never `queryHandler` (that is for queries only).
- Always invalidate the relevant query keys in `onSuccess`.
- Always call `notifySuccess` in `onSuccess` for user feedback.
- Always guard with `isErrorResponse` before calling `errorHandler` in `onError`.

---

## Disabled / Loading States

- Pass `disabled={isPending}` to all form inputs during mutation.
- Pass `disabled={isPending}` to the submit button.
- Never block the entire form with a spinner overlay — disable individual fields instead.

---

## Pure Validators in `lib/`

Validators that do not depend on RHF go in `lib/` as plain functions:

```ts
// features/decline-profile/lib/declineProfile.validators.ts
export const isReasonTooLong = (reason: string): boolean => reason.length > 500
```

These are unit-testable without RHF context.

# Storybook — Play Functions Reference

Play functions are interaction tests that run after the story renders. They share the `@testing-library` API with Vitest component tests.

## Basic structure

```typescript
import { expect, userEvent, within } from '@storybook/test';

export const SubmitForm: Story = {
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement);

    await step('Fill in the form', async () => {
      await userEvent.type(canvas.getByLabelText('Name'), 'Alice');
      await userEvent.type(canvas.getByLabelText('Email'), 'alice@example.com');
    });

    await step('Submit', async () => {
      await userEvent.click(canvas.getByRole('button', { name: 'Create' }));
    });

    await step('Verify success message', async () => {
      const msg = await canvas.findByText('User created');
      await expect(msg).toBeInTheDocument();
    });
  },
};
```

Use `step()` to label phases — they appear in the Storybook Interactions panel for easy debugging.

## Portals (Modal, Drawer, Select dropdown)

Content in portals is rendered outside `canvasElement`. Query from `document.body` instead.

```typescript
play: async ({ canvasElement }) => {
  await userEvent.click(within(canvasElement).getByRole('button', { name: 'Open' }));

  // Dialog is in a portal — not inside canvasElement
  const dialog = await within(document.body).findByRole('dialog');
  await expect(within(dialog).getByText('Confirm?')).toBeInTheDocument();
},
```

## Keyboard navigation

```typescript
play: async ({ canvasElement }) => {
  const canvas = within(canvasElement);

  // Tab to next focusable element
  await userEvent.tab();
  await expect(canvas.getByRole('button', { name: 'Cancel' })).toHaveFocus();

  // Escape closes modal / dropdown
  await userEvent.keyboard('{Escape}');
  await expect(within(document.body).queryByRole('dialog')).not.toBeInTheDocument();
},
```

## Composing play functions

Reuse a parent story's interactions to avoid setup duplication:

```typescript
export const FilledForm: Story = {
  play: async (context) => {
    const canvas = within(context.canvasElement);
    await userEvent.type(canvas.getByLabelText('Name'), 'Alice');
    await userEvent.type(canvas.getByLabelText('Email'), 'alice@example.com');
  },
};

// ValidationError builds on top of FilledForm
export const ValidationError: Story = {
  play: async (context) => {
    await FilledForm.play?.(context);                           // reuse parent setup
    const canvas = within(context.canvasElement);
    await userEvent.clear(canvas.getByLabelText('Email'));
    await userEvent.type(canvas.getByLabelText('Email'), 'not-an-email');
    await userEvent.click(canvas.getByRole('button', { name: 'Create' }));
    const error = await canvas.findByText('Invalid email');
    await expect(error).toBeInTheDocument();
  },
};
```

## Accessibility testing with the a11y addon

```typescript
export const Default: Story = {
  parameters: {
    a11y: {
      config: {
        rules: [
          { id: 'color-contrast', enabled: true },
          { id: 'label', enabled: true },
        ],
      },
    },
  },
};
```

The `@storybook/addon-a11y` addon runs axe-core after every story render. Violations appear in the Accessibility panel. No `play` function required.

## Checklist

- [ ] Use `step()` to label interaction phases
- [ ] Use `findBy*` (not `getBy*`) after async actions — it retries until the element appears
- [ ] Query portals from `document.body`, not `canvasElement`
- [ ] Compose play functions to avoid duplication across related stories
- [ ] All expects use `await expect(...)` — the test runner requires awaited assertions

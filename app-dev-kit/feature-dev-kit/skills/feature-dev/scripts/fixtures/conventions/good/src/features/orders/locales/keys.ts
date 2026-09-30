export const ordersKeys = {
  actions: {
    place: 'actions.place',
    placing: 'actions.placing',
  },
  form: {
    quantity: 'form.quantity',
    errors: {
      quantityMin: 'form.errors.quantityMin',
    },
  },
  status: {
    free: 'status.free',
    out: 'status.out',
  },
} as const

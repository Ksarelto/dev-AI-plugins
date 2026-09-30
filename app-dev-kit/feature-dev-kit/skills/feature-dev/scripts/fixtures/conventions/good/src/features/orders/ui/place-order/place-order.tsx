import { useTranslation } from 'react-i18next'
import { notify } from '@/shared/lib/notify'
import { Button, ButtonType } from '@/shared/ui/button'
import { ErrorBoundary } from '@/shared/ui/error-boundary'
import { usePlaceOrder } from '../../hooks/use-place-order'
import { ordersKeys } from '../../locales/keys'
import { LISTING_STATUS_KEY } from './constants'
import * as styles from './styles'
import { placeOrderSchema, type PlaceOrderProps } from './types'

const PlaceOrderContent = ({ onDone }: PlaceOrderProps): JSX.Element => {
  const { t } = useTranslation()
  const { mutate, isPending, isOut } = usePlaceOrder()

  const handleSubmit = (): void => {
    const input = placeOrderSchema.parse({ quantity: 1 })
    mutate(input, { onSuccess: onDone })
    notify.success(t(ordersKeys.actions.place))
  }

  const submitKey = isPending ? ordersKeys.actions.placing : ordersKeys.actions.place
  const statusKey = isOut ? LISTING_STATUS_KEY.out : LISTING_STATUS_KEY.free

  return (
    <div className={styles.root}>
      <p className={styles.status(isOut)}>
        {t(statusKey)}
      </p>
      <Button
        type={ButtonType.Submit}
        disabled={isPending}
        onClick={handleSubmit}
        aria-label={t(ordersKeys.actions.place)}
      >
        {t(submitKey)}
      </Button>
    </div>
  )
}

export const PlaceOrder = (props: PlaceOrderProps): JSX.Element => (
  <ErrorBoundary>
    <PlaceOrderContent {...props} />
  </ErrorBoundary>
)

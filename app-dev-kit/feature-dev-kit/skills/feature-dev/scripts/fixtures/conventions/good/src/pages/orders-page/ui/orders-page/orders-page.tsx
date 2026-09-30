import { PlaceOrder } from '@/features/orders'
import * as styles from './styles'

const OrdersPage = (): JSX.Element => {
  const handleDone = (): void => {
    window.history.back()
  }

  return (
    <div className={styles.root}>
      <PlaceOrder onDone={handleDone} />
    </div>
  )
}

export default OrdersPage

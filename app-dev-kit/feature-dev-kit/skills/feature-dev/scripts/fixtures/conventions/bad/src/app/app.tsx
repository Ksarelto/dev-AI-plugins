import { CartPanel } from '@/features/cart'
import * as styles from './styles'

const noop = (): void => undefined

export const App = (): JSX.Element => (
  <div className={styles.root}>
    <CartPanel
      items={[]}
      isLoading={false}
      onClose={noop}
    />
  </div>
)

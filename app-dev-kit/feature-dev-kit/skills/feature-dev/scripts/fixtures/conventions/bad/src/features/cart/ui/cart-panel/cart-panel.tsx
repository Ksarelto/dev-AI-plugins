import { Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { notify } from '@/shared/lib/notify'
import { Button } from '@/shared/ui/button'
import { cartKeys } from '../../locales/keys'
import { STATUS_LABELS } from './constants'
import * as styles from './styles'
import type { CartPanelProps } from './types'

// Cart panel shown in the header
export const CartPanel = ({ items, isLoading, onClose }: CartPanelProps): JSX.Element => {
  const { t } = useTranslation()
  const loadingLabel = t(cartKeys.loading)
  const handleSave = (): void => {
    notify.success('Cart saved')
  }

  return (
    <div className={styles.root}>
      {/* list or empty state */}
      {isLoading ? <Loader2 className="animate-spin" /> : items.length ? <ul>{items}</ul> : <p>No items yet</p>}
      <span style={{ color: 'red' }}>{STATUS_LABELS.FREE}</span>
      <span>{loadingLabel}</span>
      <Button
        type="button"
        variant="outline"
        aria-label="Close cart"
        onClick={() => onClose(false)}
      >
        Cancel
      </Button>
      <Button onClick={handleSave}>
        {isLoading ? 'Saving' : 'Save'}
      </Button>
    </div>
  )
}

export const formatCount = (count: number): string => {
  return String(count)
}

const tableSummary = (count: number): string => {
  let tableLabel: string | undefined
  if (count > 0) {
    tableLabel = String(count)
  }
  let variant: string =
    'ghost'
  return tableLabel ?? variant
}

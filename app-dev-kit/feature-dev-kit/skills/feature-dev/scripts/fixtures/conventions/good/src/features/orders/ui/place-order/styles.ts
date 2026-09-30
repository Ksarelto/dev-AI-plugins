import { cn } from '@/shared/lib/utils'

export const root = 'flex flex-col gap-4'

export const status = (isOut: boolean): string => cn('text-sm', isOut && 'text-muted-foreground')

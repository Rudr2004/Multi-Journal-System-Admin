import type { LucideIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Skeleton } from './States'
import { cn } from '@/lib/utils'

interface Props {
  label: string
  value?: React.ReactNode
  hint?: string
  icon?: LucideIcon
  to?: string
  loading?: boolean
  tone?: 'default' | 'warning' | 'danger'
}

const CHIP = {
  default: 'bg-accent-soft text-accent',
  warning: 'bg-amber-50 text-amber-700',
  danger: 'bg-red-50 text-red-700',
}

export function KpiCard({ label, value, hint, icon: Icon, to, loading, tone = 'default' }: Props) {
  const body = (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <span className="text-xs font-medium text-muted">{label}</span>
        {loading ? (
          <Skeleton className="mt-2 h-7 w-20" />
        ) : (
          <div className={cn('mt-1 text-2xl font-semibold tracking-tight', tone === 'warning' && 'text-amber-700', tone === 'danger' && 'text-red-700')}>{value}</div>
        )}
        {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
      </div>
      {Icon && (
        <span aria-hidden className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', CHIP[tone])}>
          <Icon size={18} strokeWidth={1.6} />
        </span>
      )}
    </div>
  )
  const cls = 'card block p-4'
  return to ? (
    <Link to={to} className={cn(cls, 'transition-all hover:border-indigo-200 hover:shadow-sm')}>{body}</Link>
  ) : (
    <div className={cls}>{body}</div>
  )
}

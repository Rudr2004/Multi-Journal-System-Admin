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

export function KpiCard({ label, value, hint, icon: Icon, to, loading, tone = 'default' }: Props) {
  const body = (
    <>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted">{label}</span>
        {Icon && <Icon size={16} strokeWidth={1.5} className="text-faint" aria-hidden />}
      </div>
      {loading ? (
        <Skeleton className="mt-2 h-7 w-20" />
      ) : (
        <div className={cn('mt-1 text-2xl font-semibold tracking-tight', tone === 'warning' && 'text-amber-700', tone === 'danger' && 'text-red-700')}>{value}</div>
      )}
      {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
    </>
  )
  const cls = 'card block p-4'
  return to ? (
    <Link to={to} className={cn(cls, 'transition-colors hover:border-slate-300')}>{body}</Link>
  ) : (
    <div className={cls}>{body}</div>
  )
}

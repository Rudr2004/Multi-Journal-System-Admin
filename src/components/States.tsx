import type { LucideIcon } from 'lucide-react'
import { AlertTriangle, Inbox } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('animate-pulse rounded-md bg-slate-200/70', className)} />
}

export function EmptyState({ icon: Icon = Inbox, title, hint, action }: { icon?: LucideIcon; title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-subtle text-faint">
        <Icon size={20} strokeWidth={1.5} aria-hidden />
      </div>
      <p className="text-base font-medium text-ink">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-sm text-muted">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function ErrorState({ message = 'Something went wrong while loading this.', onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center justify-center px-6 py-10 text-center">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-red-50 text-red-600">
        <AlertTriangle size={20} strokeWidth={1.5} aria-hidden />
      </div>
      <p className="text-base font-medium text-ink">{message}</p>
      {onRetry && <button className="btn-secondary mt-4" onClick={onRetry}>Try again</button>}
    </div>
  )
}

export function DraftLabel() {
  return (
    <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-200">
      Draft — details to be finalised
    </span>
  )
}

import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Copy } from 'lucide-react'
import type { MessageStatus, PaymentStatus } from '@/shared/types'
import type { Tone } from '@/shared/statuses'
import { Badge } from '@/components/Badges'
import { toast } from '@/components/Toasts'
import { useScopeJournals } from '@/lib/scope'
import { cn } from '@/lib/utils'
import { useCurrentUser, usePermission } from '@/permissions/hooks'
import type { Area } from '@/permissions/matrix'
import type { AccessCtx } from '@/mock/api/papers'
import {
  SCORE_CRITERIA, recommendationMeta, type Recommendation, type ReviewScores, type ReviewerKind,
} from '@/mock/data/editorial'

export const PAYMENT_LABEL: Record<PaymentStatus, { label: string; tone: Tone }> = {
  none: { label: 'Not due', tone: 'neutral' },
  pending: { label: 'Pending', tone: 'warning' },
  verification: { label: 'Awaiting verification', tone: 'info' },
  verified: { label: 'Verified', tone: 'success' },
  rejected: { label: 'Rejected', tone: 'danger' },
  refunded: { label: 'Refunded', tone: 'neutral' },
}
export const PaymentStatusBadge = ({ status }: { status: PaymentStatus }) => <Badge tone={PAYMENT_LABEL[status].tone}>{PAYMENT_LABEL[status].label}</Badge>

export const MESSAGE_TONE: Record<MessageStatus, Tone> = { queued: 'neutral', sent: 'info', delivered: 'success', failed: 'danger' }
export const MessageStatusBadge = ({ status }: { status: MessageStatus }) => <Badge tone={MESSAGE_TONE[status]}>{status[0].toUpperCase() + status.slice(1)}</Badge>

export const RecommendationBadge = ({ value }: { value: Recommendation }) => {
  const m = recommendationMeta(value)
  return <Badge tone={m.tone}>{m.label}</Badge>
}

export const ReviewerTypeBadge = ({ kind }: { kind: ReviewerKind }) => (
  <Badge tone={kind === 'panel' ? 'accent' : 'neutral'}>{kind === 'panel' ? 'Review Panel' : 'In-house'}</Badge>
)

/** Paper ID never truncates; the title wraps to two lines with the full text on hover. */
export function PaperIdLink({ id, to }: { id: string; to?: string }) {
  return <Link to={to ?? `/submissions/${id}`} className="whitespace-nowrap font-medium text-accent hover:underline">{id}</Link>
}

export function TitleText({ title, className }: { title: string; className?: string }) {
  return <span title={title} className={cn('line-clamp-2 max-w-[420px] text-sm', className)}>{title}</span>
}

/** Access context for the editorial APIs: journals in scope, user and the permission level for an area. */
export function useAccess(area: Area): AccessCtx {
  const journals = useScopeJournals()
  const user = useCurrentUser()
  const { level } = usePermission(area)
  return useMemo(() => ({ journals, userId: user?.id ?? '', level }), [journals, user?.id, level])
}

export function CopyButton({ value, label }: { value: string; label: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      aria-label={`Copy ${label}`}
      title={`Copy ${label}`}
      className="btn-ghost !h-7 !w-7 !px-0"
      onClick={() => {
        void navigator.clipboard?.writeText(value).catch(() => undefined)
        setDone(true)
        toast.success(`${label} copied`)
        setTimeout(() => setDone(false), 1600)
      }}
    >
      {done ? <Check size={14} className="text-green-600" /> : <Copy size={14} strokeWidth={1.5} />}
    </button>
  )
}

/** Five criteria shown as compact meters (value / 5). */
export function ScoreBars({ scores }: { scores: ReviewScores }) {
  return (
    <ul className="space-y-1.5" aria-label="Review scores">
      {SCORE_CRITERIA.map((c) => (
        <li key={c.key} className="flex items-center gap-3 text-sm">
          <span className="w-24 shrink-0 text-muted">{c.label}</span>
          <span className="h-1.5 flex-1 rounded-full bg-subtle" aria-hidden>
            <span className="block h-1.5 rounded-full bg-accent" style={{ width: `${(scores[c.key] / 5) * 100}%` }} />
          </span>
          <span className="w-8 text-right font-medium tabular-nums">{scores[c.key]}/5</span>
        </li>
      ))}
    </ul>
  )
}

export const SUBJECT_TAG = 'inline-flex items-center rounded-md bg-subtle px-1.5 py-0.5 text-xs text-muted'
export function SubjectTags({ subjects, matched = [] }: { subjects: string[]; matched?: string[] }) {
  return (
    <span className="flex flex-wrap gap-1">
      {subjects.map((s) => (
        <span key={s} className={cn(SUBJECT_TAG, matched.includes(s) && 'bg-accent-soft font-medium text-accent')}>{s}</span>
      ))}
    </span>
  )
}

export const todayInput = () => new Date().toISOString().slice(0, 10)
export const inDaysInput = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10)

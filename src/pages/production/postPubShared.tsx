import { Badge } from '@/components/Badges'
import { usePermission } from '@/permissions/hooks'
import type { Tone } from '@/shared/statuses'
import { CHANGE_TYPE_META, type ChangeFee, type ChangeStatus, type ChangeType } from '@/mock/data/production'

export const CHANGE_STATUS_META: Record<ChangeStatus, { label: string; tone: Tone }> = {
  requested: { label: 'Requested', tone: 'warning' },
  under_review: { label: 'Under review', tone: 'warning' },
  approved: { label: 'Approved (fee pending)', tone: 'info' },
  ready: { label: 'Ready for correction', tone: 'info' },
  revision: { label: 'Ready for correction (changes requested)', tone: 'info' },
  version_review: { label: 'Version submitted', tone: 'accent' },
  completed: { label: 'Completed', tone: 'success' },
  rejected: { label: 'Rejected', tone: 'danger' },
}

export const ChangeStatusBadge = ({ status }: { status: ChangeStatus }) => <Badge tone={CHANGE_STATUS_META[status].tone}>{CHANGE_STATUS_META[status].label}</Badge>

export const ChangeTypeBadge = ({ type }: { type: ChangeType }) => (
  <Badge tone={type === 'retraction' || type === 'withdrawal' ? 'danger' : 'neutral'}>{CHANGE_TYPE_META[type].label}</Badge>
)

const FEE_TONE: Record<ChangeFee['state'], { label: string; tone: Tone }> = {
  pending: { label: 'Fee pending', tone: 'warning' },
  paid: { label: 'Fee paid', tone: 'success' },
  waived: { label: 'Fee waived', tone: 'neutral' },
}

export const FeeBadge = ({ fee }: { fee?: ChangeFee }) => (fee ? <Badge tone={FEE_TONE[fee.state].tone}>{FEE_TONE[fee.state].label}</Badge> : <span className="text-faint">No fee</span>)

/** Who may raise a request: Support Executives (their job) and anyone who approves or manages corrections. */
export function useCanRaise() {
  const perm = usePermission('postPub')
  const can = perm.role === 'support' || perm.can('approve')
  return { can, why: can ? undefined : 'Only Support Executives raise correction requests. Your role works on approved requests.' }
}

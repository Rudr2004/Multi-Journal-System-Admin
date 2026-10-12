import { Badge } from '@/components/Badges'
import type { Tone } from '@/shared/statuses'
import { CHANGE_TYPE_META, type ChangeStatus, type ChangeType } from '@/mock/data/production'

export const CHANGE_STATUS_META: Record<ChangeStatus, { label: string; tone: Tone }> = {
  requested: { label: 'Awaiting approval', tone: 'warning' },
  approved: { label: 'Approved · new version needed', tone: 'info' },
  revision: { label: 'New version in progress', tone: 'info' },
  version_review: { label: 'Version awaiting approval', tone: 'accent' },
  completed: { label: 'Completed', tone: 'success' },
  rejected: { label: 'Rejected', tone: 'danger' },
}

export const ChangeStatusBadge = ({ status }: { status: ChangeStatus }) => <Badge tone={CHANGE_STATUS_META[status].tone}>{CHANGE_STATUS_META[status].label}</Badge>

export const ChangeTypeBadge = ({ type }: { type: ChangeType }) => (
  <Badge tone={type === 'retraction' || type === 'withdrawal' ? 'danger' : 'neutral'}>{CHANGE_TYPE_META[type].label}</Badge>
)

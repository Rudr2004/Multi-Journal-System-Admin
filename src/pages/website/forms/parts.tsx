import { Badge } from '@/components/Badges'
import type { Tone } from '@/shared/statuses'
import { FORM_STATUS_LABEL, type FormStatus } from '@/mock/data/website'

const TONE: Record<FormStatus, Tone> = { new: 'info', under_review: 'accent', approved: 'success', rejected: 'danger', on_hold: 'warning' }
export const FormStatusBadge = ({ status }: { status: FormStatus }) => <Badge tone={TONE[status]}>{FORM_STATUS_LABEL[status]}</Badge>

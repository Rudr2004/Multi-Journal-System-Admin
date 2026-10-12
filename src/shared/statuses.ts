import type { PaperStatus } from './types'

export type Tone = 'neutral' | 'info' | 'warning' | 'success' | 'danger' | 'accent'

export const STATUS_META: Record<PaperStatus, { label: string; tone: Tone; order: number }> = {
  submitted: { label: 'Submitted', tone: 'neutral', order: 1 },
  screening: { label: 'Screening', tone: 'info', order: 2 },
  under_review: { label: 'Under review', tone: 'info', order: 3 },
  decision_pending: { label: 'Decision pending', tone: 'warning', order: 4 },
  changes_requested: { label: 'Changes requested', tone: 'warning', order: 5 },
  accepted: { label: 'Accepted · queued 08:45', tone: 'accent', order: 6 },
  payment_pending: { label: 'Payment pending', tone: 'warning', order: 7 },
  paid: { label: 'Paid', tone: 'success', order: 8 },
  in_production: { label: 'In production', tone: 'accent', order: 9 },
  returned_to_production: { label: 'Returned to production', tone: 'danger', order: 10 },
  ready_for_approval: { label: 'Ready for approval', tone: 'accent', order: 11 },
  published: { label: 'Published', tone: 'success', order: 12 },
  indexed: { label: 'Indexed', tone: 'success', order: 13 },
  rejected: { label: 'Rejected', tone: 'danger', order: 14 },
  withdrawn: { label: 'Withdrawn', tone: 'neutral', order: 15 },
  retracted: { label: 'Retracted', tone: 'danger', order: 16 },
  corrected: { label: 'Corrected', tone: 'warning', order: 17 },
}

export const PIPELINE_STAGES: { key: string; label: string; statuses: PaperStatus[] }[] = [
  { key: 'screening', label: 'Screening', statuses: ['submitted', 'screening'] },
  { key: 'review', label: 'Review', statuses: ['under_review', 'changes_requested'] },
  { key: 'decision', label: 'Decision', statuses: ['decision_pending'] },
  { key: 'payment', label: 'Payment', statuses: ['accepted', 'payment_pending'] },
  { key: 'production', label: 'Production', statuses: ['paid', 'in_production', 'returned_to_production'] },
  { key: 'approval', label: 'Approval', statuses: ['ready_for_approval'] },
  { key: 'published', label: 'Published', statuses: ['published', 'indexed', 'corrected'] },
]

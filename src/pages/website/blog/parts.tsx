import { Badge } from '@/components/Badges'
import { BLOG_STATUS_META, type BlogStatus } from '@/mock/data/blog'

export function BlogStatusBadge({ status }: { status: BlogStatus }) {
  const m = BLOG_STATUS_META[status]
  return <Badge tone={m.tone}>{m.label}</Badge>
}

/** Statuses a person may edit the content in, by permission level. */
export const EDITABLE_BY_AUTHOR: BlogStatus[] = ['draft', 'rejected']
export const EDITABLE_BY_APPROVER: BlogStatus[] = ['draft', 'rejected', 'pending', 'approved', 'scheduled']

export const formatBytes = (kb: number) => (kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`)

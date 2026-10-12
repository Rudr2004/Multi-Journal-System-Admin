import { Link } from 'react-router-dom'
import { Mail, MessageCircle, MessageSquare } from 'lucide-react'
import type { Channel, MessageStatus } from '@/shared/types'
import { Badge } from '@/components/Badges'
import { Skeleton } from '@/components/States'
import type { Tone } from '@/shared/statuses'

export const CHANNEL_LABEL: Record<Channel, string> = { email: 'Email', sms: 'SMS', whatsapp: 'WhatsApp' }
const CHANNEL_ICON = { email: Mail, sms: MessageSquare, whatsapp: MessageCircle }

export function ChannelBadge({ channel }: { channel: Channel }) {
  const Icon = CHANNEL_ICON[channel]
  return <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm"><Icon size={14} strokeWidth={1.5} className="text-faint" aria-hidden />{CHANNEL_LABEL[channel]}</span>
}

const STATUS_TONE: Record<MessageStatus, Tone> = { queued: 'neutral', sent: 'info', delivered: 'success', failed: 'danger' }
export function MessageStatusBadge({ status }: { status: MessageStatus }) {
  return <Badge tone={STATUS_TONE[status]} className="capitalize">{status}</Badge>
}

export function PaperLink({ id }: { id?: string }) {
  if (!id) return <span className="text-faint">—</span>
  return <Link to={`/submissions/${id}`} className="whitespace-nowrap font-medium text-accent hover:underline">{id}</Link>
}

export function PageSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
    </div>
  )
}

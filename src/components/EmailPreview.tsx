import { Mail } from 'lucide-react'

/** Read-only preview of an outgoing email. */
export function EmailPreview({ to, subject, body, from = 'editorial@edtechpublishers.in' }: { to: string; subject: string; body: string; from?: string }) {
  return (
    <figure aria-label="Email preview" className="overflow-hidden rounded-lg border border-line bg-white">
      <figcaption className="flex items-center gap-2 border-b border-line bg-page px-3 py-2 text-xs font-medium text-muted"><Mail size={14} strokeWidth={1.5} aria-hidden /> Email preview</figcaption>
      <div className="space-y-1 border-b border-line px-4 py-3 text-xs text-muted">
        <p><span className="inline-block w-14">From</span><span className="text-ink">{from}</span></p>
        <p><span className="inline-block w-14">To</span><span className="text-ink">{to}</span></p>
        <p><span className="inline-block w-14">Subject</span><span className="font-medium text-ink">{subject}</span></p>
      </div>
      <div className="whitespace-pre-wrap px-4 py-3 text-sm leading-6">{body}</div>
    </figure>
  )
}

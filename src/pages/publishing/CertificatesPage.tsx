import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Eye, Mail, QrCode, RefreshCcw } from 'lucide-react'
import { PageHeader } from '@/layout/PageHeader'
import { DataTable, SelectFilter, type Column } from '@/components/DataTable'
import { Badge, JournalBadge } from '@/components/Badges'
import { CertificatePreview } from '@/components/CertificatePreview'
import { Drawer } from '@/components/Dialog'
import { DescriptionList } from '@/components/Form'
import { RelativeTime } from '@/components/Time'
import { GuardedButton } from '@/components/Tooltip'
import { toast } from '@/components/Toasts'
import { useAsync } from '@/lib/useAsync'
import { useIsAllJournals, useScopeJournals } from '@/lib/scope'
import { LEVEL_RANK } from '@/permissions/matrix'
import { useCurrentUser, usePermission } from '@/permissions/hooks'
import { listCertificates, regenerateCertificate, resendCertificate, resendCertificates, type CertificateRow } from '@/mock/api/certificates'
import { doiFor } from '@/shared/paperId'
import { formatDate } from '@/shared/formatters'
import type { Paper } from '@/shared/types'

export function CertificatesPage() {
  const journals = useScopeJournals()
  const all = useIsAllJournals()
  const perm = usePermission('certificates')
  const user = useCurrentUser()
  const [sent, setSent] = useState('')
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState<string[]>([])
  const r = useAsync(() => listCertificates(journals), [journals.join()])

  /** Work level only covers papers assigned to the user; approve/manage cover everything. */
  const canAct = (p: Paper) => LEVEL_RANK[perm.level] >= LEVEL_RANK.approve || (perm.level === 'work' && !!user && p.assigneeId === user.id)
  const why = (p: Paper) => (canAct(p) ? undefined : perm.level === 'work' ? 'You can only manage certificates for papers assigned to you.' : perm.why('work'))

  const rows = useMemo(() => (r.data ?? []).filter((c) => !sent || (sent === 'sent' ? c.record.sendCount > 0 : c.record.sendCount === 0)), [r.data, sent])
  const current = r.data?.find((c) => c.key === preview)

  const act = async (c: CertificateRow, kind: 'regen' | 'resend') => {
    setBusy((b) => [...b, c.key])
    try {
      if (kind === 'regen') { await regenerateCertificate(c.key); toast.success(`Certificate regenerated for ${c.author.name} (v${c.record.version + 1}).`) }
      else { await resendCertificate(c.key); toast.success(`Certificate emailed to ${c.author.email}.`) }
      r.reload()
    } catch (e) { toast.error((e as Error).message) } finally { setBusy((b) => b.filter((x) => x !== c.key)) }
  }

  const columns: Column<CertificateRow>[] = [
    { id: 'paper', header: 'Paper', locked: true, sort: (c) => c.paper.id, cell: (c) => (
      <div className="min-w-0">
        <Link to={`/submissions/${c.paper.id}`} className="whitespace-nowrap font-medium text-accent hover:underline">{c.paper.id}</Link>
        <p className="line-clamp-2 max-w-[340px] text-sm text-muted" title={c.paper.title}>{c.paper.title}</p>
      </div>
    ) },
    ...(all ? [{ id: 'journal', header: 'Journal', sort: (c: CertificateRow) => c.paper.journal, cell: (c: CertificateRow) => <JournalBadge code={c.paper.journal} /> }] : []),
    { id: 'author', header: 'Author', sort: (c) => c.author.name, cell: (c) => (
      <div><p className="flex items-center gap-2">{c.author.name}{c.author.corresponding && <Badge tone="neutral">Corresponding</Badge>}</p><p className="text-xs text-muted">{c.author.email}</p></div>
    ) },
    { id: 'version', header: 'Version', align: 'right', cell: (c) => <span className="tabular-nums">v{c.record.version}</span> },
    { id: 'issued', header: 'Issued', sort: (c) => c.record.issuedAt, cell: (c) => <span className="whitespace-nowrap">{formatDate(c.record.issuedAt)}</span> },
    { id: 'sent', header: 'Last emailed', sort: (c) => c.record.lastSentAt ?? '', cell: (c) => (c.record.lastSentAt ? <RelativeTime value={c.record.lastSentAt} /> : <span className="text-muted">Not sent yet</span>) },
    { id: 'actions', header: 'Actions', locked: true, cell: (c) => (
      <div className="flex gap-1.5" data-no-row-click>
        <button className="btn-ghost !h-8" onClick={() => setPreview(c.key)} aria-label={`Preview certificate for ${c.author.name}`}><Eye size={14} strokeWidth={1.5} aria-hidden /> Preview</button>
        <GuardedButton className="btn-ghost !h-8" allowed={canAct(c.paper)} why={why(c.paper)} disabled={busy.includes(c.key)} onClick={() => act(c, 'resend')} aria-label={`Resend certificate to ${c.author.name}`}><Mail size={14} strokeWidth={1.5} aria-hidden /> Resend</GuardedButton>
      </div>
    ) },
  ]

  return (
    <>
      <PageHeader title="Certificates" description="One certificate of publication per author of every published paper. The QR code opens the published article page." />
      <DataTable id="certificates" data={rows} columns={columns} rowKey={(c) => c.key} loading={r.loading && !r.data} error={!!r.error} onRetry={r.reload}
        onRowClick={(c) => setPreview(c.key)}
        search={{ placeholder: 'Search paper, title or author', text: (c) => `${c.paper.id} ${c.paper.title} ${c.author.name} ${c.author.email}` }}
        filters={<SelectFilter label="Emailed" value={sent} onChange={setSent} options={[{ value: 'sent', label: 'Already emailed' }, { value: 'unsent', label: 'Not emailed yet' }]} />}
        selectable
        bulkActions={(sel, clear) => {
          const ok = sel.filter((c) => canAct(c.paper))
          return (
            <GuardedButton className="btn-secondary !h-8" allowed={ok.length > 0} why={perm.why('work') ?? 'None of the selected certificates are assigned to you.'}
              onClick={async () => {
                try { await resendCertificates(ok.map((c) => c.key)); toast.success(`${ok.length} certificate${ok.length === 1 ? '' : 's'} emailed${ok.length < sel.length ? ` (${sel.length - ok.length} skipped — not assigned to you)` : ''}.`); clear(); r.reload() }
                catch (e) { toast.error((e as Error).message) }
              }}>
              <Mail size={14} strokeWidth={1.5} aria-hidden /> Resend {ok.length}
            </GuardedButton>
          )
        }}
        empty={{ icon: QrCode, title: 'No certificates yet', hint: 'Certificates are generated automatically when a paper is published.' }} />

      <Drawer open={!!current} onClose={() => setPreview(null)} title="Certificate preview" width={640}>
        {current && (
          <div className="space-y-5">
            <CertificatePreview authorName={current.author.name} paperTitle={current.paper.title} paperId={current.paper.id} journal={current.paper.journal} date={current.record.issuedAt} doi={doiFor(current.paper.id)} />
            <DescriptionList items={[
              { label: 'Author', value: `${current.author.name} · ${current.author.email}` },
              { label: 'Version', value: `v${current.record.version} · issued ${formatDate(current.record.issuedAt)}` },
              { label: 'QR code links to', value: <a href={current.verifyUrl} target="_blank" rel="noreferrer" className="break-all text-accent hover:underline">{current.verifyUrl}</a> },
              { label: 'Emailed', value: current.record.sendCount ? <>{current.record.sendCount} time{current.record.sendCount === 1 ? '' : 's'}, last <RelativeTime value={current.record.lastSentAt!} /></> : 'Not sent yet' },
            ]} cols={1} />
            <div className="flex flex-wrap gap-2 border-t border-line pt-4">
              <GuardedButton className="btn-secondary" allowed={canAct(current.paper)} why={why(current.paper)} disabled={busy.includes(current.key)} onClick={() => act(current, 'regen')}><RefreshCcw size={15} strokeWidth={1.5} aria-hidden /> Regenerate</GuardedButton>
              <GuardedButton className="btn-primary" allowed={canAct(current.paper)} why={why(current.paper)} disabled={busy.includes(current.key)} onClick={() => act(current, 'resend')}><Mail size={15} strokeWidth={1.5} aria-hidden /> Resend to author</GuardedButton>
            </div>
          </div>
        )}
      </Drawer>
    </>
  )
}

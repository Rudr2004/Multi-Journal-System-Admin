import { Fragment, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, Clock, Code2, Copy, RefreshCcw, XCircle } from 'lucide-react'
import { PageHeader } from '@/layout/PageHeader'
import { DataTable, SelectFilter, type Column } from '@/components/DataTable'
import { Badge, JournalBadge } from '@/components/Badges'
import { Drawer } from '@/components/Dialog'
import { KpiCard } from '@/components/KpiCard'
import { Skeleton } from '@/components/States'
import { RelativeTime } from '@/components/Time'
import { GuardedButton } from '@/components/Tooltip'
import { toast } from '@/components/Toasts'
import { useAsync } from '@/lib/useAsync'
import { useIsAllJournals, useScopeJournals } from '@/lib/scope'
import { usePermission } from '@/permissions/hooks'
import { getDepositXml, listDeposits, retryDeposit, type DepositRow } from '@/mock/api/doi'
import type { DepositStatus } from '@/shared/types'
import type { Tone } from '@/shared/statuses'

const STATUS: Record<DepositStatus, { label: string; tone: Tone }> = {
  pending: { label: 'Pending', tone: 'warning' },
  success: { label: 'Success', tone: 'success' },
  failed: { label: 'Failed', tone: 'danger' },
  re_deposited: { label: 'Re-deposited', tone: 'info' },
}

/** Tiny XML tokenizer for the read-only viewer (no external highlighter needed). */
function highlight(line: string): ReactNode[] {
  const re = /(<!--.*?-->)|(<\/?[\w:?.-]+)|(\s[\w:.-]+)(=)("[^"]*")|(\??\/?>)/g
  const out: ReactNode[] = []
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(line))) {
    if (m.index > last) out.push(<Fragment key={out.length}>{line.slice(last, m.index)}</Fragment>)
    if (m[1]) out.push(<span key={out.length} className="italic text-slate-400">{m[1]}</span>)
    else if (m[2]) out.push(<span key={out.length} className="text-indigo-300">{m[2]}</span>)
    else if (m[3]) out.push(<Fragment key={out.length}><span className="text-amber-300">{m[3]}</span>{m[4]}<span className="text-emerald-300">{m[5]}</span></Fragment>)
    else out.push(<span key={out.length} className="text-indigo-300">{m[6]}</span>)
    last = m.index + m[0].length
  }
  if (last < line.length) out.push(<Fragment key={out.length}>{line.slice(last)}</Fragment>)
  return out
}

function XmlViewer({ xml }: { xml: string }) {
  const lines = xml.split('\n')
  return (
    <pre aria-label="Crossref deposit XML" className="overflow-x-auto rounded-lg bg-slate-900 p-4 font-mono text-xs leading-5 text-slate-100">
      <code>
        {lines.map((l, i) => (
          <div key={i} className="flex">
            <span aria-hidden className="mr-4 w-6 shrink-0 select-none text-right text-slate-500">{i + 1}</span>
            <span className="whitespace-pre">{highlight(l)}</span>
          </div>
        ))}
      </code>
    </pre>
  )
}

export function DoiPage() {
  const journals = useScopeJournals()
  const all = useIsAllJournals()
  const perm = usePermission('doi')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState<string[]>([])
  const [viewing, setViewing] = useState<DepositRow | null>(null)
  const r = useAsync(() => listDeposits(journals), [journals.join()])
  const xml = useAsync(() => (viewing ? getDepositXml(viewing.id) : Promise.resolve('')), [viewing?.id, viewing?.version])

  const rows = useMemo(() => (r.data ?? []).filter((d) => !status || d.status === status), [r.data, status])
  const count = (s: DepositStatus) => (r.data ?? []).filter((d) => d.status === s).length

  const retry = async (d: DepositRow) => {
    setBusy((b) => [...b, d.id])
    try {
      const next = await retryDeposit(d.id)
      toast.success(`Deposit for ${d.paperId} succeeded (version ${next.version}).`)
      r.reload()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy((b) => b.filter((x) => x !== d.id))
    }
  }

  const columns: Column<DepositRow>[] = [
    { id: 'paper', header: 'Paper', locked: true, sort: (d) => d.paperId, cell: (d) => (
      <div className="min-w-0">
        <Link to={`/submissions/${d.paperId}`} className="whitespace-nowrap font-medium text-accent hover:underline">{d.paperId}</Link>
        {d.paper && <p className="line-clamp-2 max-w-[360px] text-sm text-muted" title={d.paper.title}>{d.paper.title}</p>}
      </div>
    ) },
    ...(all ? [{ id: 'journal', header: 'Journal', sort: (d: DepositRow) => d.journal, cell: (d: DepositRow) => <JournalBadge code={d.journal} /> }] : []),
    { id: 'doi', header: 'DOI', cell: (d) => <code className="whitespace-nowrap font-mono text-xs">{d.doi}</code> },
    { id: 'status', header: 'Status', sort: (d) => d.status, cell: (d) => (
      <div>
        <Badge tone={STATUS[d.status].tone}>{STATUS[d.status].label}</Badge>
        {d.status === 'failed' && d.error && <p className="mt-1 max-w-[260px] text-xs text-red-700">{d.error}</p>}
      </div>
    ) },
    { id: 'version', header: 'Version', align: 'right', sort: (d) => d.version, cell: (d) => <span className="tabular-nums">v{d.version}</span> },
    { id: 'at', header: 'Last attempt', sort: (d) => d.at, cell: (d) => <RelativeTime value={d.at} /> },
    { id: 'actions', header: 'Actions', locked: true, mobileHide: false, cell: (d) => (
      <div className="flex gap-1.5" data-no-row-click>
        {d.status === 'failed' && (
          <GuardedButton className="btn-secondary !h-8" allowed={perm.can('manage')} why={perm.why('manage')} disabled={busy.includes(d.id)} onClick={() => retry(d)}>
            <RefreshCcw size={14} strokeWidth={1.5} className={busy.includes(d.id) ? 'animate-spin' : ''} aria-hidden /> {busy.includes(d.id) ? 'Retrying…' : 'Retry'}
          </GuardedButton>
        )}
        <button className="btn-ghost !h-8" onClick={() => setViewing(d)}><Code2 size={14} strokeWidth={1.5} aria-hidden /> View XML</button>
      </div>
    ) },
  ]

  return (
    <>
      <PageHeader title="DOI & Crossref" description="Every published article is registered with Crossref under the 10.55041 prefix. Failed deposits can be retried here." />
      <section aria-label="Deposit summary" className="mb-5 grid grid-cols-2 gap-4 md:grid-cols-4">
        <KpiCard label="Successful" value={count('success')} icon={CheckCircle2} loading={r.loading && !r.data} />
        <KpiCard label="Re-deposited" value={count('re_deposited')} icon={RefreshCcw} loading={r.loading && !r.data} />
        <KpiCard label="Pending" value={count('pending')} icon={Clock} loading={r.loading && !r.data} tone={count('pending') ? 'warning' : 'default'} />
        <KpiCard label="Failed" value={count('failed')} icon={XCircle} loading={r.loading && !r.data} tone={count('failed') ? 'danger' : 'default'} />
      </section>
      <DataTable id="doi-deposits" data={rows} columns={columns} rowKey={(d) => d.id} loading={r.loading && !r.data} error={!!r.error} onRetry={r.reload}
        search={{ placeholder: 'Search Paper ID, DOI or title', text: (d) => `${d.paperId} ${d.doi} ${d.paper?.title ?? ''}` }}
        filters={<SelectFilter label="Status" value={status} onChange={setStatus} options={Object.entries(STATUS).map(([value, m]) => ({ value, label: m.label }))} />}
        rowClassName={(d) => (d.status === 'failed' ? 'bg-red-50/40' : undefined)}
        selectable
        bulkActions={(sel, clear) => {
          const failed = sel.filter((d) => d.status === 'failed')
          return (
            <GuardedButton className="btn-secondary !h-8" allowed={perm.can('manage') && failed.length > 0} why={perm.why('manage') ?? 'Select at least one failed deposit.'}
              onClick={async () => { clear(); await Promise.all(failed.map(retry)) }}>
              <RefreshCcw size={14} strokeWidth={1.5} aria-hidden /> Retry {failed.length} failed
            </GuardedButton>
          )
        }}
        empty={{ title: 'No deposits found', hint: 'Deposits appear here as articles are published. Clear the status filter to see all.' }} />

      <Drawer open={!!viewing} onClose={() => setViewing(null)} title={viewing ? `Crossref XML · ${viewing.paperId}` : 'Crossref XML'} width={680}>
        {viewing && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge tone={STATUS[viewing.status].tone}>{STATUS[viewing.status].label}</Badge>
              <span className="text-muted">Version {viewing.version} ·</span><code className="font-mono text-xs">{viewing.doi}</code>
              <button className="btn-secondary ml-auto !h-8" disabled={!xml.data} onClick={() => { void navigator.clipboard?.writeText(xml.data ?? ''); toast.success('XML copied to clipboard') }}><Copy size={14} strokeWidth={1.5} aria-hidden /> Copy</button>
            </div>
            {xml.loading && !xml.data ? <Skeleton className="h-96 w-full" /> : <XmlViewer xml={xml.data ?? ''} />}
            <p className="text-xs text-muted">Mock of the Crossref 5.3.1 journal-article deposit. The live integration submits this document to the Crossref deposit API.</p>
          </div>
        )}
      </Drawer>
    </>
  )
}

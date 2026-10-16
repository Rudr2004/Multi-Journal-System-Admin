import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AlertOctagon, ArrowRight, CheckCircle2, Eye, ExternalLink, Newspaper, Play, Send } from 'lucide-react'
import { PageHeader } from '@/layout/PageHeader'
import { AutosaveIndicator } from '@/components/Autosave'
import { Badge, JournalBadge, StatusBadge } from '@/components/Badges'
import { DueChip } from '@/components/Due'
import { SectionCard } from '@/components/Card'
import { ErrorState, Skeleton } from '@/components/States'
import { Tabs } from '@/components/Tabs'
import { Timeline } from '@/components/Timeline'
import { GuardedButton } from '@/components/Tooltip'
import { toast } from '@/components/Toasts'
import { RelativeTime } from '@/components/Time'
import { useAsync } from '@/lib/useAsync'
import { useUnsavedChanges } from '@/lib/useUnsavedChanges'
import { useCan, useCanAct, usePermission } from '@/permissions/hooks'
import { useDataStore } from '@/mock/store'
import { doiFor } from '@/shared/paperId'
import {
  dueOf, generateCertificates, getWorkspace, saveDraft, sendForFinalApproval, startProduction, uploadFinalFile,
} from '@/mock/api/production'
import { draftSeo, readiness, validateMetadata, type ProductionRecord } from '@/mock/data/production'
import { ManuscriptPane } from './workspace/ManuscriptPane'
import { ArticleEditor } from './workspace/ArticleEditor'
import { MetadataChecklist, type Draft } from './workspace/MetadataChecklist'
import { SeoPanel } from './workspace/SeoPanel'
import { EditorNotesBanner } from '@/pages/editorial/EditorNotes'
import { CertificatesPanel, FinalFilePanel } from './workspace/FilesCertificates'
import { TemplateCard } from './TemplateDownload'
import { CitePanel } from './workspace/CitePanel'
import { DraftPreview } from './DraftPreview'

const toDraft = (r: ProductionRecord): Draft => ({ title: r.title, authors: r.authors, abstract: r.abstract, keywords: r.keywords, references: r.references, blocks: r.blocks, seo: r.seo, returnAcknowledged: r.returnAcknowledged, citeInPrint: r.citeInPrint ?? false })

export function WorkspacePage() {
  const { paperId = '' } = useParams()
  const ws = useAsync(() => getWorkspace(paperId), [paperId])
  if (ws.error) {
    return (
      <>
        <PageHeader title="Production workspace" crumbs={[{ label: paperId }]} />
        <div className="card"><ErrorState message={ws.error.message} onRetry={ws.reload} /></div>
      </>
    )
  }
  if (ws.loading || !ws.data) {
    return (
      <>
        <PageHeader title="Production workspace" crumbs={[{ label: paperId }]} />
        <div className="grid gap-4 lg:grid-cols-2" aria-busy="true" aria-label="Loading workspace"><Skeleton className="h-[480px]" /><Skeleton className="h-[480px]" /></div>
      </>
    )
  }
  // key remounts the editor when switching papers
  return <Workspace key={paperId} initial={ws.data.record} paperId={paperId} />
}

function Workspace({ initial, paperId }: { initial: ProductionRecord; paperId: string }) {
  const navigate = useNavigate()
  const paper = useDataStore((s) => s.papers.find((p) => p.id === paperId))
  const users = useDataStore((s) => s.users)
  const events = useDataStore((s) => s.events)
  const perm = usePermission('production')
  const canApprove = useCan('finalApproval', 'approve')
  const assigneeId = paper?.assigneeId ?? users.find((u) => u.status === 'active' && u.assignments[paper?.journal ?? 'IJMAT'] === 'associate_editor')?.id
  const canAct = useCanAct('production', 'work', assigneeId)

  const [record, setRecord] = useState(initial)
  const [draft, setDraft] = useState<Draft>(() => toDraft(initial))
  const [pending, setPending] = useState(false)
  const [version, setVersion] = useState(0)
  const [busy, setBusy] = useState<string | null>(null)
  const [tab, setTab] = useState('article')
  const [previewing, setPreviewing] = useState(false)
  const [metaFocus, setMetaFocus] = useState<{ key?: string; n: number }>({ n: 0 })
  /** Jump from an outstanding item to the tab where it is fixed. */
  const goToItem = (m: string) => {
    const key = (['title', 'authors', 'affiliations', 'abstract', 'keywords', 'references'] as const).find((k) => m.toLowerCase().startsWith(k))
    if (key) { setMetaFocus((f) => ({ key, n: f.n + 1 })); setTab('meta') }
    else if (/^(seo|slug)/i.test(m)) setTab('seo')
    else if (/^final paper/i.test(m)) setTab('file')
    else if (/^certificates/i.test(m)) setTab('certs')
    else window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const draftRef = useRef(draft)
  useEffect(() => { draftRef.current = draft })

  const status = paper?.status
  const editable = canAct && (status === 'in_production' || status === 'returned_to_production')

  // debounced autosave into the store
  useEffect(() => {
    if (!pending) return
    const t = setTimeout(() => { saveDraft(paperId, draftRef.current); setPending(false) }, 800)
    return () => clearTimeout(t)
  }, [pending, version, paperId])
  useUnsavedChanges(pending)

  const update = useCallback((p: Partial<Draft>) => {
    setDraft((d) => {
      const next = { ...d, ...p }
      if ('title' in p || 'abstract' in p || 'keywords' in p) {
        const auto = draftSeo(next.title, next.abstract, next.keywords)
        next.seo = { ...next.seo, ...(next.seo.titleEdited ? {} : { title: auto.title }), ...(next.seo.descriptionEdited ? {} : { description: auto.description }), ...(next.seo.slugEdited ? {} : { slug: auto.slug }) }
      }
      return next
    })
    setPending(true)
    setVersion((v) => v + 1)
  }, [])

  const merged = useMemo<ProductionRecord>(() => ({ ...record, ...draft }), [record, draft])
  const checks = useMemo(() => validateMetadata(merged), [merged])
  const ready = useMemo(() => readiness(merged, !!record.returnNote && status === 'returned_to_production'), [merged, record.returnNote, status])

  if (!paper) return <ErrorState message="This paper is no longer available." />

  const flush = () => { saveDraft(paperId, draftRef.current); setPending(false) }
  const syncRecord = (r: ProductionRecord) => { setRecord(r); setDraft((d) => ({ ...d, authors: r.authors })) }

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key)
    try { await fn() } catch (e) { toast.error((e as Error).message) } finally { setBusy(null) }
  }

  const onStart = () => run('start', async () => { await startProduction(paperId); toast.success('Production started. The workspace is now editable.') })
  const onUpload = (name: string, sizeKb: number) => run('upload', async () => {
    flush()
    const r = await uploadFinalFile(paperId, name, sizeKb)
    setRecord((cur) => ({ ...cur, finalFile: r.finalFile }))
    toast.success(`${name} uploaded as version ${r.finalFile?.version}.`)
  })
  const onGenerate = () => run('certs', async () => {
    flush()
    const r = await generateCertificates(paperId)
    syncRecord(r)
    toast.success(`Certificates generated for ${r.certificates.length} author(s).`)
  })
  const onRegenerate = (email: string, name: string, date: string) => run('certs', async () => {
    flush()
    const r = await generateCertificates(paperId, [email], { email, name, date })
    syncRecord(r)
    toast.success(`Certificate regenerated for ${name}.`)
  })
  const onSend = () => run('send', async () => {
    flush()
    await sendForFinalApproval(paperId)
    toast.success('Sent for final approval.')
    navigate('/production')
  })

  const returned = status === 'returned_to_production' ? record.returnNote : undefined
  const missingTip = ready.missing.length ? `Before sending: ${ready.missing.slice(0, 4).join('; ')}${ready.missing.length > 4 ? `; and ${ready.missing.length - 4} more` : ''}.` : undefined
  const sendReason = !canAct ? perm.why('work') ?? 'Only the assigned Associate Editor can send this paper.' : !editable ? 'Start production before sending for approval.' : missingTip
  const paperEvents = events.filter((e) => e.paperId === paperId).slice(0, 12)
  const openChecks = checks.filter((c) => !c.pass).length

  const actions = (
    <>
      <AutosaveIndicator watch={version} />
      <button type="button" className="btn-secondary" onClick={() => setPreviewing(true)}><Eye size={15} aria-hidden /> View draft</button>
      {status === 'paid' && (
        <GuardedButton className="btn-primary" allowed={canAct} why={perm.why('work') ?? 'Only the assigned Associate Editor can start production.'} disabled={busy === 'start'} onClick={onStart}>
          <Play size={15} aria-hidden /> Start production
        </GuardedButton>
      )}
      {(status === 'in_production' || status === 'returned_to_production') && (
        <GuardedButton className="btn-primary" allowed={editable && ready.ready} why={sendReason} disabled={busy === 'send'} onClick={onSend}>
          <Send size={15} aria-hidden /> Send for final approval
        </GuardedButton>
      )}
    </>
  )

  return (
    <>
      <PageHeader title={paper.id} description={paper.title} crumbs={[{ label: paper.id }]} actions={actions} />

      <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <JournalBadge code={paper.journal} />
        <StatusBadge status={paper.status} />
        {(status === 'in_production' || status === 'returned_to_production' || status === 'ready_for_approval') && <Badge tone="info"><Newspaper size={12} aria-hidden /> In Press</Badge>}
        {status !== 'ready_for_approval' && <span className="inline-flex items-center gap-1.5 text-muted">Due <DueChip value={dueOf(paper)} showDate /></span>}
        <span className="text-muted">Assignee: <span className="text-ink">{users.find((u) => u.id === assigneeId)?.name ?? 'Unassigned'}</span></span>
        <span className="text-muted">DOI: <span className="font-mono text-xs text-ink">{doiFor(paper.id)}</span></span>
        <Link to={`/submissions/${paper.id}`} className="inline-flex items-center gap-1 text-accent hover:underline">Submission record <ExternalLink size={12} aria-hidden /></Link>
      </div>

      <EditorNotesBanner paperId={paper.id} />
      <TemplateCard journal={paper.journal} />

      {returned && (
        <div role="alert" className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4">
          <div className="flex items-start gap-3">
            <AlertOctagon size={20} className="mt-0.5 shrink-0 text-red-600" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-red-900">Returned to production by {returned.by} · <RelativeTime value={returned.at} /></p>
              <p className="mt-1 whitespace-pre-line text-sm text-red-900">{returned.text}</p>
              {editable && (
                <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-red-900">
                  <input type="checkbox" className="h-4 w-4 rounded border-red-300 accent-red-600" checked={draft.returnAcknowledged} onChange={(e) => update({ returnAcknowledged: e.target.checked })} />
                  I have addressed every point in this note
                </label>
              )}
            </div>
          </div>
        </div>
      )}

      {(status === 'in_production' || status === 'returned_to_production' || status === 'ready_for_approval') && (
        <p role="note" className="mb-5 flex items-start gap-2 rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-900"><Newspaper size={16} className="mt-0.5 shrink-0" aria-hidden /> Listed publicly on the Article In Press page while in production. It leaves your list when the Editor publishes it.</p>
      )}
      {status === 'paid' && (
        <div className="mb-5 flex items-center justify-between gap-3 rounded-lg border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-900">
          <span>Payment is verified. Start production to unlock editing; the paper then moves to “In production”.</span>
        </div>
      )}
      {status === 'ready_for_approval' && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-900">
          <span className="inline-flex items-center gap-2"><CheckCircle2 size={18} aria-hidden /> Sent for final approval {record.sentAt && <RelativeTime value={record.sentAt} />}. The workspace is read-only until the Editor decides.</span>
          {canApprove && <Link to={`/final-approval/${paper.id}`} className="btn-secondary">Open in final approval <ArrowRight size={14} aria-hidden /></Link>}
        </div>
      )}
      {status && !['paid', 'in_production', 'returned_to_production', 'ready_for_approval'].includes(status) && (
        <div className="mb-5 rounded-lg border border-line bg-subtle p-3 text-sm text-muted">This paper has left production. The workspace is shown read-only.</div>
      )}
      {!editable && (status === 'in_production' || status === 'returned_to_production') && (
        <div className="mb-5 rounded-lg border border-line bg-subtle p-3 text-sm text-muted">{perm.why('work') ?? 'This paper is assigned to another Associate Editor.'} You can review everything but not change it.</div>
      )}

      <Tabs value={tab} onChange={setTab} tabs={[
        {
          id: 'article', label: 'Manuscript & web article', content: (
            <div className="grid gap-4 lg:grid-cols-2 lg:[&>section]:h-[720px]">
              <ManuscriptPane record={record} />
              <ArticleEditor title={draft.title} abstract={draft.abstract} blocks={draft.blocks} readOnly={!editable}
                onTitle={(v) => update({ title: v })} onAbstract={(v) => update({ abstract: v })} onBlocks={(b) => update({ blocks: b })} />
            </div>
          ),
        },
        { id: 'meta', label: 'Metadata checklist', badge: openChecks || undefined, content: (
          <div className="grid gap-4 lg:grid-cols-2 lg:items-start lg:[&>section]:sticky lg:[&>section]:top-4 lg:[&>section]:h-[720px]">
            <MetadataChecklist key={metaFocus.n} initialOpen={metaFocus.key} items={checks} draft={draft} update={update} readOnly={!editable} original={record.manuscript} />
            <ManuscriptPane record={record} />
          </div>
        ) },
        { id: 'seo', label: 'SEO & URL', content: <SeoPanel draft={draft} update={update} readOnly={!editable} journal={paper.journal} paperId={paper.id} originalAbstract={record.manuscript.abstract} /> },
        { id: 'cite', label: 'Cite this article', badge: draft.citeInPrint ? undefined : 'Optional', content: <CitePanel journal={paper.journal} paperId={paper.id} draft={draft} update={update} readOnly={!editable} onGoToFile={() => setTab('file')} /> },
        { id: 'file', label: 'Final file', badge: record.finalFile ? undefined : '!', content: <FinalFilePanel record={record} readOnly={!editable} busy={busy === 'upload'} onUpload={onUpload} /> },
        {
          id: 'certs', label: 'Certificates', badge: record.certificates.length ? record.certificates.length : '!', content: (
            <CertificatesPanel record={merged} authors={draft.authors} journal={paper.journal} paperId={paper.id} title={draft.title} readOnly={!editable} busy={busy === 'certs'} onGenerate={onGenerate} onRegenerate={onRegenerate} />
          ),
        },
        { id: 'history', label: 'Activity', content: <SectionCard title="Paper timeline"><Timeline items={paperEvents} empty="No production activity recorded yet." /></SectionCard> },
      ]} />

      <DraftPreview open={previewing} onClose={() => setPreviewing(false)} record={merged} journal={paper.journal} paperId={paper.id} articleType={paper.articleType} />

      {(status === 'in_production' || status === 'returned_to_production') && (
        <section aria-label="Send readiness" className="mt-6 card p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-[16px] font-semibold">Ready for final approval?</h2>
            {ready.ready ? <Badge tone="success">All required items complete</Badge> : <Badge tone="warning">{ready.missing.length} item(s) outstanding</Badge>}
          </div>
          {ready.missing.length > 0 && (
            <ul className="mt-3 space-y-1 text-sm">{ready.missing.map((m) => <li key={m}><button type="button" onClick={() => goToItem(m)} className="group flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-subtle"><ArrowRight size={14} className="mt-1 shrink-0 text-accent" aria-hidden /><span className="text-muted group-hover:text-ink group-hover:underline">{m}</span></button></li>)}</ul>
          )}
        </section>
      )}
    </>
  )
}

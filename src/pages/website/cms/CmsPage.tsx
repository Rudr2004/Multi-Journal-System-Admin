import { useCallback, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Eye, EyeOff, FileText, Pencil } from 'lucide-react'
import { PageHeader } from '@/layout/PageHeader'
import { DataTable, SelectFilter, type Column } from '@/components/DataTable'
import { Tabs } from '@/components/Tabs'
import { Badge, JournalBadge } from '@/components/Badges'
import { ConfirmDialog } from '@/components/Dialog'
import { GuardedButton } from '@/components/Tooltip'
import { RelativeTime } from '@/components/Time'
import { toast } from '@/components/Toasts'
import { useAsync } from '@/lib/useAsync'
import { useIsAllJournals } from '@/lib/scope'
import { useUnsavedChanges } from '@/lib/useUnsavedChanges'
import { usePermission } from '@/permissions/hooks'
import { useSession } from '@/mock/store'
import { FLAG_META } from '@/permissions/flags'
import { PAGE_GROUPS, type HomeSections, type SeoRule, type StaticPage } from '@/mock/data/pageMgmt'
import type { CmsEntry } from '@/mock/data/website'
import { listStaticPages, setStaticPageStatus } from '@/mock/api/pageMgmt'
import { useWebsiteStore } from '@/mock/stores/website'
import type { JournalCode } from '@/shared/types'
import { useJournalKey } from '../shared'
import { HomeSectionsTab, homeDirty } from './HomeSectionsTab'
import { SeoSettingsTab, seoDirty } from './SeoSettingsTab'

export function EntryStatusBadge({ status }: { status: CmsEntry['status'] }) {
  return <Badge tone={status === 'published' ? 'success' : 'neutral'}>{status === 'published' ? 'Published' : 'Draft'}</Badge>
}

function StaticPages() {
  const { journals, key } = useJournalKey()
  const all = useIsAllJournals()
  const { can, why } = usePermission('cms')
  const { data, loading, error, reload } = useAsync(() => listStaticPages(journals), [key])
  const [status, setStatus] = useState('')
  const [group, setGroup] = useState('')
  const [publishing, setPublishing] = useState<StaticPage | null>(null)
  const [unpublishing, setUnpublishing] = useState<StaticPage | null>(null)
  const canPublish = can('approve')
  const rows = useMemo(() => (data ?? []).filter((p) => (!status || p.status === status) && (!group || p.group === group)), [data, status, group])
  const run = async (fn: () => Promise<void>, ok: string) => { try { await fn(); toast.success(ok); reload() } catch (e) { toast.error((e as Error).message) } }

  const columns: Column<StaticPage>[] = [
    {
      id: 'title', header: 'Page', locked: true, sort: (r) => r.title.toLowerCase(),
      cell: (r) => (
        <div className="min-w-0">
          <Link to={`/pages/static/${r.id}`} className="line-clamp-2 font-medium text-accent hover:underline" title={r.title}>{r.title}</Link>
          <p className="text-xs text-muted">/{r.slug} · {r.blocks.length} blocks</p>
        </div>
      ),
    },
    ...(all ? [{ id: 'journal', header: 'Journal', sort: (r: StaticPage) => r.journal, cell: (r: StaticPage) => <JournalBadge code={r.journal} /> }] : []),
    { id: 'group', header: 'Group', sort: (r) => r.group, cell: (r) => <Badge tone="accent">{r.group}</Badge> },
    { id: 'status', header: 'Status', sort: (r) => r.status, cell: (r) => <EntryStatusBadge status={r.status} /> },
    { id: 'updated', header: 'Last updated', sort: (r) => r.updatedAt, cell: (r) => <div className="text-sm"><RelativeTime value={r.updatedAt} /><p className="text-xs text-muted">by {r.updatedBy}</p></div> },
    {
      id: 'actions', header: '', locked: true,
      cell: (r) => (
        <div className="flex justify-end gap-1">
          <Link to={`/pages/static/${r.id}`} className="btn-ghost h-8 px-2" aria-label={`Edit ${r.title}`}><Pencil size={15} strokeWidth={1.5} /></Link>
          {r.status === 'published'
            ? <GuardedButton allowed={canPublish} why={why('approve')} className="btn-ghost h-8 px-2" aria-label={`Unpublish ${r.title}`} onClick={() => setUnpublishing(r)}><EyeOff size={15} strokeWidth={1.5} /></GuardedButton>
            : <GuardedButton allowed={canPublish} why={why('approve')} className="btn-ghost h-8 px-2" aria-label={`Publish ${r.title}`} onClick={() => setPublishing(r)}><Eye size={15} strokeWidth={1.5} /></GuardedButton>}
        </div>
      ),
    },
  ]

  return (
    <>
      <DataTable<StaticPage>
        id="cms-static" data={rows} columns={columns} rowKey={(r) => r.id} loading={loading && !data} error={!!error} onRetry={reload}
        search={{ placeholder: 'Search pages…', text: (r) => `${r.title} ${r.slug} ${r.group}` }}
        filters={<>
          <SelectFilter label="Group" value={group} onChange={setGroup} options={PAGE_GROUPS.map((g) => ({ value: g, label: g }))} />
          <SelectFilter label="Status" value={status} onChange={setStatus} options={[{ value: 'published', label: 'Published' }, { value: 'draft', label: 'Draft' }]} />
        </>}
        empty={{ icon: FileText, title: 'No pages match', hint: 'Clear the filters to see every policy and information page.' }}
      />
      <ConfirmDialog open={!!publishing} onClose={() => setPublishing(null)} title={`Publish “${publishing?.title ?? ''}”?`} confirmLabel="Publish"
        consequences={[`Make /${publishing?.slug ?? ''} visible on the ${publishing?.journal ?? ''} website within minutes`, 'Allow search engines to index it', 'Record the change in the audit log']}
        onConfirm={() => publishing && run(() => setStaticPageStatus(publishing.id, 'published'), `Published “${publishing.title}”.`)} />
      <ConfirmDialog open={!!unpublishing} onClose={() => setUnpublishing(null)} title={`Unpublish “${unpublishing?.title ?? ''}”?`} confirmLabel="Unpublish"
        consequences={[`Remove /${unpublishing?.slug ?? ''} from the public website (visitors will see a not-found page)`, 'Keep the content here as a draft', 'Record the change in the audit log']}
        onConfirm={() => unpublishing && run(() => setStaticPageStatus(unpublishing.id, 'draft'), `Unpublished “${unpublishing.title}”.`)} />
    </>
  )
}

type TabId = 'static' | 'home' | 'seo'

export default function CmsPage() {
  const [params, setParams] = useSearchParams()
  const raw = params.get('tab')
  const tab: TabId = raw === 'home' || raw === 'seo' ? raw : 'static'
  const seoOn = useSession((s) => s.flags.seoAutoLink)
  const savedHome = useWebsiteStore((s) => s.homeSections)
  const savedSeo = useWebsiteStore((s) => s.seoRules)
  const [homeDrafts, setHomeDrafts] = useState<Partial<Record<JournalCode, HomeSections>>>({})
  const [seoDrafts, setSeoDrafts] = useState<Partial<Record<JournalCode, SeoRule[]>>>({})

  const onHome = useCallback((j: JournalCode, v: HomeSections | null) => setHomeDrafts((d) => { const n = { ...d }; if (v) n[j] = v; else delete n[j]; return n }), [])
  const onSeo = useCallback((j: JournalCode, v: SeoRule[] | null) => setSeoDrafts((d) => { const n = { ...d }; if (v) n[j] = v; else delete n[j]; return n }), [])

  const dirty = useMemo(() => {
    const h = (Object.keys(homeDrafts) as JournalCode[]).some((j) => {
      const d = homeDrafts[j]!
      const ids = savedHome[j].notices.map((n) => n.id)
      return homeDirty({ ...d, notices: d.notices.filter((n) => ids.includes(n.id)) }, savedHome[j])
    })
    const s = (Object.keys(seoDrafts) as JournalCode[]).some((j) => seoDirty(seoDrafts[j]!, savedSeo.filter((r) => r.journal === j)))
    return h || s
  }, [homeDrafts, seoDrafts, savedHome, savedSeo])
  useUnsavedChanges(dirty)

  return (
    <>
      <PageHeader title="Page Management" description="Static pages and SEO details, plus what the home page shows. Changes go live only when published or saved." />
      <Tabs value={tab} onChange={(t) => setParams(t === 'static' ? {} : { tab: t }, { replace: true })}
        tabs={[
          { id: 'static', label: 'Static pages', content: <StaticPages /> },
          { id: 'home', label: 'Home Page Sections', content: <HomeSectionsTab drafts={homeDrafts} onDraft={onHome} /> },
          { id: 'seo', label: 'SEO Settings', badge: seoOn ? FLAG_META.seoAutoLink.badge : 'Off', content: <SeoSettingsTab drafts={seoDrafts} onDraft={onSeo} /> },
        ]} />
    </>
  )
}

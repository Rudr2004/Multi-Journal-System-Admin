import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Download, Eye, Globe2, Trophy } from 'lucide-react'
import { PageHeader } from '@/layout/PageHeader'
import { useAsync } from '@/lib/useAsync'
import { JournalBadge, StatusBadge } from '@/components/Badges'
import { DescriptionList } from '@/components/Form'
import { ErrorState, Skeleton } from '@/components/States'
import { KpiCard } from '@/components/KpiCard'
import { SectionCard } from '@/components/Card'
import { CHART_COLORS } from '@/styles/tokens'
import { doiFor } from '@/shared/paperId'
import { formatNumber, formatPercent } from '@/shared/formatters'
import { getArticleAnalytics } from '@/mock/api/analytics'
import { ChartFrame, HBarChart, XYChart } from './charts'

export function ArticleAnalyticsPage() {
  const { paperId = '' } = useParams()
  const { data, loading, error, reload } = useAsync(() => getArticleAnalytics(paperId), [paperId])
  const back = <Link to="/analytics" className="btn-secondary"><ArrowLeft size={15} strokeWidth={1.5} aria-hidden /> Back to analytics</Link>

  if (error) {
    return (
      <>
        <PageHeader title="Article analytics" crumbs={[{ label: paperId }]} actions={back} />
        <div className="card"><ErrorState message={error.message} onRetry={reload} /></div>
      </>
    )
  }
  const p = data?.paper
  const months = data?.months ?? []
  const countries = data?.countries ?? []

  return (
    <>
      <PageHeader title="Article analytics" description="Views, downloads and readers for a single published article (last 12 months)." crumbs={[{ label: paperId }]} actions={back} />

      <section className="card mb-5 p-4" aria-label="Article">
        {loading || !p ? (
          <div className="space-y-2"><Skeleton className="h-5 w-2/3" /><Skeleton className="h-4 w-1/3" /></div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <JournalBadge code={p.journal} />
              <StatusBadge status={p.status} />
              <Link to={`/submissions/${p.id}`} className="whitespace-nowrap font-medium text-accent hover:underline">{p.id}</Link>
            </div>
            <h2 className="line-clamp-2 text-[16px] font-semibold" title={p.title}>{p.title}</h2>
            <DescriptionList cols={3} items={[
              { label: 'Author', value: p.author }, { label: 'Article type', value: p.articleType }, { label: 'DOI', value: <span className="whitespace-nowrap">{doiFor(p.id)}</span> },
            ]} />
          </div>
        )}
      </section>

      <section aria-label="Key figures" className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Views" icon={Eye} loading={loading} value={formatNumber(data?.views ?? 0)} />
        <KpiCard label="PDF downloads" icon={Download} loading={loading} value={formatNumber(data?.downloads ?? 0)} hint={data ? `${formatPercent((data.downloads / Math.max(1, data.views)) * 100)} of views` : undefined} />
        <KpiCard label="Countries" icon={Globe2} loading={loading} value={countries.length} hint={countries[0] ? `Top: ${countries[0].country}` : undefined} />
        <KpiCard label="Rank in journal" icon={Trophy} loading={loading} value={data ? `#${data.rankInJournal}` : ''} hint={data ? `of ${data.journalPublished} published articles` : undefined} />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartFrame title="Views and downloads by month" loading={loading} summary={`${formatNumber(data?.views ?? 0)} views and ${formatNumber(data?.downloads ?? 0)} downloads over ${months.length} months.`}
          table={{ head: ['Month', 'Views', 'Downloads'], rows: months.map((m) => [m.label, m.views, m.downloads]) }}>
          <XYChart kind="line" data={months} xKey="label" series={[{ key: 'views', label: 'Views', color: CHART_COLORS[0] }, { key: 'downloads', label: 'Downloads', color: CHART_COLORS[1] }]} />
        </ChartFrame>
        <ChartFrame title="Readers by country" loading={loading} summary={countries[0] ? `${countries[0].country} leads with ${formatPercent(countries[0].share)} of views.` : ''}
          table={{ head: ['Country', 'Views', 'Share'], rows: countries.map((c) => [c.country, c.views, formatPercent(c.share)]) }}>
          <HBarChart data={countries.slice(0, 8).map((c) => ({ label: c.country, v: c.views }))} labelKey="label" valueKey="v" valueLabel="Views" format={(n) => formatNumber(n)} />
        </ChartFrame>
      </div>
      <SectionCard title="About these figures" className="mt-4">
        <p className="text-sm text-muted">Article figures are the article's share of its journal's traffic for the last 12 months. The article's own page in <Link to={p ? `/submissions/${p.id}` : '/submissions'} className="text-accent hover:underline">Submissions</Link> holds its full history.</p>
      </SectionCard>
    </>
  )
}

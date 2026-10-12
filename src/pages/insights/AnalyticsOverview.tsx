import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Award, BarChart3, Download, Eye, FileDown, FileText, Globe2, IndianRupee, Printer, RotateCcw, Send, Timer, TrendingUp } from 'lucide-react'
import { useDataStore } from '@/mock/store'
import { useAsync } from '@/lib/useAsync'
import { useJournals } from '@/permissions/hooks'
import { useScopeJournals } from '@/lib/scope'
import { cn } from '@/lib/utils'
import { JournalBadge, JournalDot } from '@/components/Badges'
import { DataTable, type Column } from '@/components/DataTable'
import { ErrorState } from '@/components/States'
import { KpiCard } from '@/components/KpiCard'
import { Switch } from '@/components/Form'
import { toast } from '@/components/Toasts'
import { CHART_COLORS } from '@/styles/tokens'
import { formatMoney, formatNumber, formatPercent } from '@/shared/formatters'
import type { JournalCode } from '@/shared/types'
import { JOURNAL_CODES } from '@/mock/data/core'
import { ARTICLE_TYPES, acceptanceRate, avgFirstDecision, avgPublication, conversionRate, emptyMetrics, gstTotal, inrTotal, rejectionRate, type Metrics } from '@/mock/data/analytics'
import {
  analyticsCsvRows, dataBounds, getAnalytics, presetRange, recordAnalyticsExport, type AnalyticsResult, type ArticleRow, type RangePreset,
} from '@/mock/api/analytics'
import { ChartFrame, HBarChart, XYChart, journalColor, type Series } from './charts'
import { downloadCsv } from './csv'

const compact = new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 })
const inr = (n: number) => formatMoney(n, 'INR')
const usd = (n: number) => formatMoney(n, 'USD')
const days1 = (n: number) => `${n.toFixed(1)} days`
const empty = emptyMetrics()

const PRESETS: { id: RangePreset; label: string }[] = [
  { id: '30d', label: 'Last 30 days' }, { id: '90d', label: 'Last 90 days' }, { id: '12m', label: 'Last 12 months' }, { id: 'custom', label: 'Custom' },
]

function delta(cur: number, prev: number | undefined, label: string, lowerIsBetter = false): string | undefined {
  if (prev === undefined || prev === 0) return undefined
  const pct = ((cur - prev) / prev) * 100
  if (Math.abs(pct) < 0.05) return `No change vs ${label}`
  const good = lowerIsBetter ? pct < 0 : pct > 0
  return `${pct > 0 ? '▲' : '▼'} ${Math.abs(pct).toFixed(1)}% vs ${label} (${good ? 'better' : 'worse'})`
}

export function AnalyticsOverview() {
  const navigate = useNavigate()
  const myJournals = useJournals()
  const scope = useScopeJournals()
  const issues = useDataStore((s) => s.issues)
  const [picked, setPicked] = useState<JournalCode[] | null>(null)
  const [compare, setCompare] = useState(false)
  const [preset, setPreset] = useState<RangePreset>('90d')
  const bounds = dataBounds()
  const [custom, setCustom] = useState(presetRange('30d'))
  const [issueId, setIssueId] = useState('')
  const [articleType, setArticleType] = useState('')

  const journals = useMemo(() => (picked ?? scope).filter((j) => myJournals.includes(j)), [picked, scope, myJournals])
  const isCompare = compare && journals.length > 1
  const range = preset === 'custom' ? custom : presetRange(preset)
  const issueOptions = useMemo(
    () => (journals.length === 1 ? issues.filter((i) => i.journal === journals[0] && i.articleIds.length > 0) : []),
    [issues, journals],
  )
  const activeIssue = issueOptions.some((i) => i.id === issueId) ? issueId : ''

  const { data, loading, error, reload } = useAsync(
    () => getAnalytics({ journals, from: range.from, to: range.to, compare: isCompare, issueId: activeIssue || undefined, articleType: articleType || undefined }),
    [journals, range.from, range.to, isCompare, activeIssue, articleType],
  )

  const toggleJournal = (c: JournalCode) => {
    const cur = journals
    if (cur.includes(c)) { if (cur.length > 1) setPicked(cur.filter((x) => x !== c)) }
    else setPicked(JOURNAL_CODES.filter((x) => x === c || cur.includes(x)))
  }
  const filtersActive = picked !== null || compare || preset !== '90d' || !!activeIssue || !!articleType
  const reset = () => { setPicked(null); setCompare(false); setPreset('90d'); setIssueId(''); setArticleType('') }

  const exportCsv = () => {
    if (!data) return
    downloadCsv(`analytics_${data.filters.journals.join('-')}_${data.filters.from}_to_${data.filters.to}.csv`, analyticsCsvRows(data))
    recordAnalyticsExport('CSV', data)
    toast.success(`Exported ${data.buckets.length * data.filters.journals.length} rows as CSV.`)
  }
  const exportPdf = () => {
    if (!data) return
    recordAnalyticsExport('PDF', data)
    toast.info('Preparing the PDF report — choose “Save as PDF” in the print dialog.')
    setTimeout(() => window.print(), 400)
  }

  return (
    <div className="space-y-5">
      {/* Filters */}
      <section aria-label="Filters" className="card space-y-4 p-4 print:hidden">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <fieldset className="min-w-0">
            <legend className="label">Journals</legend>
            <div className="flex flex-wrap gap-1.5">
              {myJournals.map((c) => {
                const on = journals.includes(c)
                return (
                  <button key={c} type="button" role="checkbox" aria-checked={on} onClick={() => toggleJournal(c)}
                    className={cn('inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-sm font-medium transition-colors', on ? 'border-accent bg-accent-soft text-accent' : 'border-line bg-surface text-muted hover:bg-subtle')}>
                    <JournalDot code={c} /> {c}
                  </button>
                )
              })}
            </div>
          </fieldset>
          <div className="w-56">
            <Switch checked={isCompare} onChange={setCompare} disabled={journals.length < 2} label="Compare journals" description={journals.length < 2 ? 'Select two or more journals' : 'One series per journal'} />
          </div>
          <div className="ml-auto flex flex-wrap gap-2">
            <button className="btn-secondary" onClick={exportCsv} disabled={!data || loading}><FileDown size={15} strokeWidth={1.5} aria-hidden /> Export CSV</button>
            <button className="btn-secondary" onClick={exportPdf} disabled={!data || loading}><Printer size={15} strokeWidth={1.5} aria-hidden /> Export PDF</button>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-3 border-t border-line pt-4">
          <div>
            <span className="label" id="range-label">Date range</span>
            <div role="group" aria-labelledby="range-label" className="inline-flex overflow-hidden rounded-md border border-line">
              {PRESETS.map((p) => (
                <button key={p.id} type="button" aria-pressed={preset === p.id} onClick={() => setPreset(p.id)}
                  className={cn('h-9 border-r border-line px-3 text-sm last:border-r-0', preset === p.id ? 'bg-accent-soft font-medium text-accent' : 'bg-surface text-muted hover:bg-subtle')}>{p.label}</button>
              ))}
            </div>
          </div>
          {preset === 'custom' && (
            <>
              <div>
                <label htmlFor="an-from" className="label">From</label>
                <input id="an-from" type="date" className="input !w-auto" min={bounds.min} max={custom.to} value={custom.from} onChange={(e) => e.target.value && setCustom((c) => ({ ...c, from: e.target.value }))} />
              </div>
              <div>
                <label htmlFor="an-to" className="label">To</label>
                <input id="an-to" type="date" className="input !w-auto" min={custom.from} max={bounds.max} value={custom.to} onChange={(e) => e.target.value && setCustom((c) => ({ ...c, to: e.target.value }))} />
              </div>
            </>
          )}
          <div>
            <label htmlFor="an-issue" className="label">Issue</label>
            <select id="an-issue" className="input !w-auto min-w-[190px]" value={activeIssue} disabled={journals.length !== 1} onChange={(e) => setIssueId(e.target.value)}>
              <option value="">{journals.length === 1 ? 'All issues' : 'Select one journal'}</option>
              {issueOptions.map((i) => <option key={i.id} value={i.id}>{i.label}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="an-type" className="label">Article type</label>
            <select id="an-type" className="input !w-auto min-w-[170px]" value={articleType} onChange={(e) => setArticleType(e.target.value)}>
              <option value="">All types</option>
              {ARTICLE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          {filtersActive && <button className="btn-ghost" onClick={reset}><RotateCcw size={14} strokeWidth={1.5} aria-hidden /> Reset filters</button>}
        </div>
        <p className="text-xs text-muted" role="status">
          Showing {journals.join(', ')} · {range.from} to {range.to}{data ? ` · grouped by ${data.granularity}` : ''}
          {data?.scaleNote ? ` · ${data.scaleNote}` : ''}
        </p>
      </section>

      {error ? (
        <div className="card"><ErrorState message="Analytics could not be loaded." onRetry={reload} /></div>
      ) : (
        <Dashboard data={data} loading={loading} journals={journals} compare={isCompare} onOpenArticle={(id) => navigate(`/analytics/articles/${id}`)} />
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */

type Row = Record<string, string | number>

function Dashboard({ data, loading, journals, compare, onOpenArticle }: { data?: AnalyticsResult; loading: boolean; journals: JournalCode[]; compare: boolean; onOpenArticle: (id: string) => void }) {
  const t = data?.total ?? empty
  const prev = data?.previous
  const buckets = data?.buckets ?? []
  const prevLabel = 'previous period'

  const timeRows = (pick: (m: Metrics) => number): Row[] =>
    buckets.map((b): Row => (compare ? { label: b.label, ...Object.fromEntries(journals.map((c) => [c, pick(b.byJournal[c] ?? empty)])) } : { label: b.label, v: pick(b.total) }))
  const journalRows = (pick: (m: Metrics) => number): Row[] => journals.map((c) => ({ label: c, v: pick(data?.byJournal[c] ?? empty) }))
  const perJournalSeries: Series[] = journals.map((c) => ({ key: c, label: c, color: journalColor(c) }))
  const one = (label: string, color = CHART_COLORS[0]): Series[] => [{ key: 'v', label, color }]

  const tableFor = (head: string, rows: Row[], keys: { key: string; label: string; fmt?: (n: number) => string }[]) => ({
    head: [head, ...keys.map((k) => k.label)],
    rows: rows.map((r) => [String(r.label), ...keys.map((k) => (k.fmt ? k.fmt(Number(r[k.key] ?? 0)) : Number(r[k.key] ?? 0)))]),
  })

  /* summary sentences for aria-label */
  const sumText = (what: string, value: string) => `${what}: ${value} across ${buckets.length} ${data?.granularity ?? ''} periods for ${journals.join(', ')}.`

  const compareSeries = (pairs: { key: string; label: string; color: string }[]) => pairs
  const rateSeries = compareSeries([{ key: 'acc', label: 'Acceptance rate', color: CHART_COLORS[2] }, { key: 'rej', label: 'Rejection rate', color: CHART_COLORS[4] }])
  const timeSeries = compareSeries([{ key: 'fd', label: 'Time to first decision', color: CHART_COLORS[0] }, { key: 'pub', label: 'Time to publication', color: CHART_COLORS[3] }])
  const inrSeries = compareSeries([{ key: 'base', label: 'APC (excl. GST)', color: CHART_COLORS[0] }, { key: 'cs', label: 'CGST + SGST', color: CHART_COLORS[1] }, { key: 'igst', label: 'IGST', color: CHART_COLORS[3] }])
  const vdSeries = compareSeries([{ key: 'views', label: 'Views', color: CHART_COLORS[0] }, { key: 'downloads', label: 'Downloads', color: CHART_COLORS[1] }])

  const rateRows: Row[] = compare
    ? journals.map((c) => ({ label: c, acc: +acceptanceRate(data?.byJournal[c] ?? empty).toFixed(1), rej: +rejectionRate(data?.byJournal[c] ?? empty).toFixed(1) }))
    : buckets.map((b) => ({ label: b.label, acc: +acceptanceRate(b.total).toFixed(1), rej: +rejectionRate(b.total).toFixed(1) }))
  const timeRowsDays: Row[] = compare
    ? journals.map((c) => ({ label: c, fd: +avgFirstDecision(data?.byJournal[c] ?? empty).toFixed(1), pub: +avgPublication(data?.byJournal[c] ?? empty).toFixed(1) }))
    : buckets.map((b) => ({ label: b.label, fd: +avgFirstDecision(b.total).toFixed(1), pub: +avgPublication(b.total).toFixed(1) }))
  const inrRows: Row[] = compare
    ? journals.map((c) => { const m = data?.byJournal[c] ?? empty; return { label: c, base: Math.round(m.inrBase), cs: Math.round(m.cgst + m.sgst), igst: Math.round(m.igst) } })
    : buckets.map((b) => ({ label: b.label, base: Math.round(b.total.inrBase), cs: Math.round(b.total.cgst + b.total.sgst), igst: Math.round(b.total.igst) }))
  const vdRows: Row[] = buckets.map((b) => ({ label: b.label, views: b.total.views, downloads: b.total.downloads }))

  const xHead = compare ? 'Journal' : 'Period'
  const inrFmt = (n: number) => inr(n)

  return (
    <>
      {/* KPI summary */}
      <section aria-label="Key figures" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Submissions" icon={FileText} loading={loading} value={formatNumber(t.submissions)} hint={delta(t.submissions, prev?.submissions, prevLabel)} />
        <KpiCard label="Acceptance rate" icon={TrendingUp} loading={loading} value={formatPercent(acceptanceRate(t))} hint={delta(acceptanceRate(t), prev && acceptanceRate(prev), prevLabel) ?? `${formatNumber(t.accepted)} accepted · ${formatNumber(t.rejected)} rejected`} />
        <KpiCard label="Time to first decision" icon={Timer} loading={loading} value={days1(avgFirstDecision(t))} hint={delta(avgFirstDecision(t), prev && avgFirstDecision(prev), prevLabel, true)} />
        <KpiCard label="Time to publication" icon={Timer} loading={loading} value={days1(avgPublication(t))} hint={delta(avgPublication(t), prev && avgPublication(prev), prevLabel, true)} />
        <KpiCard label="Revenue (INR, incl. GST)" icon={IndianRupee} loading={loading} value={inr(inrTotal(t))} hint={`Incl. ${inr(gstTotal(t))} GST`} />
        <KpiCard label="Revenue (USD)" icon={IndianRupee} loading={loading} value={usd(t.usdBase)} hint="No GST on export of services" />
        <KpiCard label="Article views" icon={Eye} loading={loading} value={formatNumber(t.views)} hint={delta(t.views, prev?.views, prevLabel)} />
        <KpiCard label="PDF downloads" icon={Download} loading={loading} value={formatNumber(t.downloads)} hint={delta(t.downloads, prev?.downloads, prevLabel)} />
      </section>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartFrame title="Submissions over time" loading={loading} summary={sumText('Total submissions', formatNumber(t.submissions))}
          table={tableFor('Period', timeRows((m) => m.submissions), compare ? journals.map((c) => ({ key: c, label: c })) : [{ key: 'v', label: 'Submissions' }])}>
          <XYChart kind={compare ? 'line' : 'bar'} data={timeRows((m) => m.submissions)} xKey="label" series={compare ? perJournalSeries : one('Submissions')} />
        </ChartFrame>

        <ChartFrame title="Acceptance vs rejection rate" description={compare ? 'Per journal, whole period' : 'Share of decided submissions'} loading={loading}
          summary={`Acceptance ${formatPercent(acceptanceRate(t))}, rejection ${formatPercent(rejectionRate(t))} over the selected period.`}
          table={tableFor(xHead, rateRows, [{ key: 'acc', label: 'Acceptance %', fmt: (n) => `${n}%` }, { key: 'rej', label: 'Rejection %', fmt: (n) => `${n}%` }])}>
          <XYChart kind={compare ? 'bar' : 'line'} data={rateRows} xKey="label" series={rateSeries} yMax={100} format={(n) => `${n}%`} axisFormat={(n) => `${n}%`} />
        </ChartFrame>

        <ChartFrame title="Time to first decision and to publication" description="Average days from submission" loading={loading}
          summary={`Average ${days1(avgFirstDecision(t))} to first decision and ${days1(avgPublication(t))} to publication.`}
          table={tableFor(xHead, timeRowsDays, [{ key: 'fd', label: 'First decision (days)' }, { key: 'pub', label: 'Publication (days)' }])}>
          <XYChart kind={compare ? 'bar' : 'line'} data={timeRowsDays} xKey="label" series={timeSeries} format={(n) => `${n} days`} />
        </ChartFrame>

        <ChartFrame title="Revenue (INR) with GST split" description="APC received; GST at 18% — CGST + SGST inside Gujarat, IGST elsewhere" loading={loading}
          summary={`${inr(inrTotal(t))} including ${inr(gstTotal(t))} GST.`}
          table={tableFor(xHead, inrRows, [{ key: 'base', label: 'APC excl. GST', fmt: inrFmt }, { key: 'cs', label: 'CGST + SGST', fmt: inrFmt }, { key: 'igst', label: 'IGST', fmt: inrFmt }])}>
          <XYChart kind="stacked" data={inrRows} xKey="label" series={inrSeries} format={(n) => inr(n)} axisFormat={(n) => `₹${compact.format(n)}`} />
        </ChartFrame>

        <ChartFrame title="Revenue (USD)" description="Foreign authors pay in USD; no GST (export of services)" loading={loading}
          summary={`${usd(t.usdBase)} received in USD.`}
          table={tableFor(xHead, compare ? journalRows((m) => Math.round(m.usdBase)) : timeRows((m) => Math.round(m.usdBase)), [{ key: 'v', label: 'USD', fmt: usd }])}>
          <XYChart kind="bar" data={compare ? journalRows((m) => Math.round(m.usdBase)) : timeRows((m) => Math.round(m.usdBase))} xKey="label" series={one('Revenue (USD)', CHART_COLORS[2])} format={(n) => usd(n)} axisFormat={(n) => `$${compact.format(n)}`} />
        </ChartFrame>

        {compare ? (
          <>
            <ChartFrame title="Article views" loading={loading} summary={sumText('Views', formatNumber(t.views))}
              table={tableFor('Period', timeRows((m) => m.views), journals.map((c) => ({ key: c, label: c })))}>
              <XYChart kind="line" data={timeRows((m) => m.views)} xKey="label" series={perJournalSeries} axisFormat={(n) => compact.format(n)} />
            </ChartFrame>
            <ChartFrame title="PDF downloads" className="lg:col-span-2" loading={loading} summary={sumText('Downloads', formatNumber(t.downloads))}
              table={tableFor('Period', timeRows((m) => m.downloads), journals.map((c) => ({ key: c, label: c })))}>
              <XYChart kind="line" data={timeRows((m) => m.downloads)} xKey="label" series={perJournalSeries} axisFormat={(n) => compact.format(n)} />
            </ChartFrame>
          </>
        ) : (
          <ChartFrame title="Views and downloads" loading={loading} summary={`${formatNumber(t.views)} views and ${formatNumber(t.downloads)} downloads.`}
            table={tableFor('Period', vdRows, [{ key: 'views', label: 'Views' }, { key: 'downloads', label: 'Downloads' }])}>
            <XYChart kind="line" data={vdRows} xKey="label" series={vdSeries} axisFormat={(n) => compact.format(n)} />
          </ChartFrame>
        )}
      </div>

      {/* Top articles (drill down) */}
      <section aria-labelledby="top-articles">
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <h2 id="top-articles" className="text-[16px] font-semibold">Top articles</h2>
          <p className="text-xs text-muted">Select an article to drill down into its views, downloads and countries.</p>
        </div>
        <TopArticles rows={data?.topArticles ?? []} loading={loading} showJournal={journals.length > 1} onOpen={onOpenArticle} />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartFrame title="Readers by country" description="Share of article views" loading={loading}
          summary={data ? `${data.countries[0]?.country ?? 'No country'} leads with ${formatPercent(data.countries[0]?.share ?? 0)} of views.` : ''}
          table={{ head: ['Country', 'Views', 'Share'], rows: (data?.countries ?? []).map((c) => [c.country, c.views, formatPercent(c.share)]) }}>
          <HBarChart data={(data?.countries ?? []).map((c) => ({ label: c.country, v: c.views, share: c.share }))} labelKey="label" valueKey="v" valueLabel="Views" format={(n) => formatNumber(n)} />
        </ChartFrame>

        <ChartFrame title="Message delivery rate" description="Delivered of settled messages, from the communication log" loading={loading}
          summary={(data?.delivery ?? []).map((d) => `${d.channel} ${formatPercent(d.rate)}`).join(', ') || 'No messages'}
          table={{ head: ['Channel', 'Sent', 'Delivered', 'Failed', 'Rate'], rows: (data?.delivery ?? []).map((d) => [d.channel, d.sent, d.delivered, d.failed, formatPercent(d.rate)]) }}>
          <HBarChart data={(data?.delivery ?? []).filter((d) => d.sent > 0).map((d) => ({ label: d.channel === 'whatsapp' ? 'WhatsApp' : d.channel === 'sms' ? 'SMS' : 'Email', v: +d.rate.toFixed(1) }))}
            labelKey="label" valueKey="v" valueLabel="Delivery rate" color={CHART_COLORS[2]} max={100} format={(n) => `${n.toFixed(1)}%`} />
        </ChartFrame>
      </div>

      {/* Referral + awards */}
      <section aria-labelledby="ref-awards" className="card">
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h2 id="ref-awards" className="text-[16px] font-semibold">Referrals and awards</h2>
          <Link to="/referrals" className="text-sm text-accent hover:underline">Open referrals</Link>
        </header>
        <div className="grid grid-cols-2 gap-3 p-4 lg:grid-cols-4">
          <KpiCard label="Referrals sent" icon={Send} loading={loading} value={formatNumber(t.referralsSent)} />
          <KpiCard label="Referrals converted" icon={Globe2} loading={loading} value={formatNumber(t.referralsConverted)} hint={`${formatPercent(conversionRate(t))} conversion`} />
          <KpiCard label="Awards granted" icon={Award} loading={loading} value={formatNumber(t.awards)} />
          <KpiCard label="Journals in view" icon={BarChart3} loading={loading} value={journals.length} hint={journals.join(', ')} />
        </div>
        <div className="overflow-x-auto border-t border-line">
          <table className="w-full text-sm">
            <caption className="sr-only">Referral and award figures per journal</caption>
            <thead className="text-xs text-muted">
              <tr><th scope="col" className="px-4 py-2 text-left font-medium">Journal</th><th scope="col" className="px-4 py-2 text-right font-medium">Referrals sent</th><th scope="col" className="px-4 py-2 text-right font-medium">Converted</th><th scope="col" className="px-4 py-2 text-right font-medium">Conversion</th><th scope="col" className="px-4 py-2 text-right font-medium">Awards</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {journals.map((c) => {
                const m = data?.byJournal[c] ?? empty
                return (
                  <tr key={c}>
                    <th scope="row" className="px-4 py-2 text-left font-normal"><JournalBadge code={c} /></th>
                    <td className="px-4 py-2 text-right tabular-nums">{formatNumber(m.referralsSent)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatNumber(m.referralsConverted)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatPercent(conversionRate(m))}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatNumber(m.awards)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}

function TopArticles({ rows, loading, showJournal, onOpen }: { rows: ArticleRow[]; loading: boolean; showJournal: boolean; onOpen: (id: string) => void }) {
  const columns: Column<ArticleRow>[] = [
    {
      id: 'article', header: 'Article', locked: true, sort: (r) => r.title,
      cell: (r) => (
        <div className="min-w-0">
          <Link to={`/analytics/articles/${r.paperId}`} className="whitespace-nowrap font-medium text-accent hover:underline">{r.paperId}</Link>
          <p className="line-clamp-2 max-w-[460px] text-sm text-muted" title={r.title}>{r.title}</p>
        </div>
      ),
    },
    ...(showJournal ? [{ id: 'journal', header: 'Journal', sort: (r: ArticleRow) => r.journal, cell: (r: ArticleRow) => <JournalBadge code={r.journal} /> } as Column<ArticleRow>] : []),
    { id: 'type', header: 'Type', sort: (r) => r.articleType, cell: (r) => r.articleType, defaultHidden: true },
    { id: 'views', header: 'Views', align: 'right', sort: (r) => r.views, cell: (r) => <span className="tabular-nums">{formatNumber(r.views)}</span> },
    { id: 'downloads', header: 'Downloads', align: 'right', sort: (r) => r.downloads, cell: (r) => <span className="tabular-nums">{formatNumber(r.downloads)}</span> },
    { id: 'country', header: 'Top country', sort: (r) => r.topCountry, cell: (r) => r.topCountry },
  ]
  // table id includes the journal column so saved column choices never mismatch
  return (
    <DataTable<ArticleRow>
      id={showJournal ? 'analytics-top-articles-multi' : 'analytics-top-articles'}
      data={rows} columns={columns} rowKey={(r) => r.paperId} loading={loading} pageSize={8}
      onRowClick={(r) => onOpen(r.paperId)}
      search={{ placeholder: 'Search articles', text: (r) => `${r.paperId} ${r.title} ${r.topCountry}` }}
      empty={{ title: 'No published articles match these filters', hint: 'Widen the date range or clear the issue and article-type filters.' }}
    />
  )
}

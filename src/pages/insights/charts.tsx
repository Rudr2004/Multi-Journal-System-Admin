import type { ReactNode } from 'react'
import { Bar, BarChart, CartesianGrid, LabelList, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ChevronDown } from 'lucide-react'
import { CHART_COLORS } from '@/styles/tokens'
import { JOURNAL_CODES } from '@/mock/data/core'
import type { JournalCode } from '@/shared/types'
import { SectionCard } from '@/components/Card'
import { Skeleton } from '@/components/States'

/** A journal keeps its colour in every chart, whatever filters are applied (colour follows the entity). */
export const journalColor = (code: JournalCode) => CHART_COLORS[JOURNAL_CODES.indexOf(code)]

const AXIS = '#64748B'
const GRID = '#E2E8F0'
const INK = '#334155'

export interface Series { key: string; label: string; color: string }
type Row = Record<string, string | number>

interface TipProps {
  active?: boolean
  payload?: ReadonlyArray<{ name?: string | number; value?: unknown; color?: string; dataKey?: unknown }>
  label?: string | number
  format?: (n: number, key: string) => string
}

/** One tooltip style for every chart: label, then a coloured swatch + series + value per row. */
function ChartTooltip({ active, payload, label, format }: TipProps) {
  if (!active || !payload?.length) return null
  return (
    <div className="min-w-[150px] rounded-md border border-line bg-surface px-3 py-2 text-xs shadow-overlay">
      <p className="mb-1 font-medium text-ink">{label}</p>
      <ul className="space-y-0.5">
        {payload.map((p, i) => (
          <li key={i} className="flex items-center justify-between gap-4">
            <span className="inline-flex items-center gap-1.5 text-muted">
              <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: p.color }} />
              {p.name}
            </span>
            <span className="font-medium tabular-nums text-ink">{typeof p.value === 'number' ? (format ? format(p.value, String(p.dataKey)) : p.value.toLocaleString('en-IN')) : String(p.value ?? '')}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

const legendFmt = (v: string) => <span style={{ color: INK, fontSize: 12 }}>{v}</span>

export function XYChart({ data, xKey, series, kind, format, axisFormat, height = 260, yMax }: {
  data: Row[]; xKey: string; series: Series[]; kind: 'line' | 'bar' | 'stacked'
  format?: (n: number, key: string) => string; axisFormat?: (n: number) => string; height?: number; yMax?: number
}) {
  const common = { data, margin: { top: 4, right: 12, bottom: 0, left: 0 } }
  const axes = (
    <>
      <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
      <XAxis dataKey={xKey} tick={{ fill: AXIS, fontSize: 12 }} tickLine={false} axisLine={{ stroke: GRID }} interval="preserveStartEnd" minTickGap={24} />
      <YAxis tick={{ fill: AXIS, fontSize: 12 }} tickLine={false} axisLine={false} width={52} tickFormatter={axisFormat} domain={[0, yMax ?? 'auto']} allowDecimals={false} />
      <Tooltip content={<ChartTooltip format={format} />} cursor={kind === 'line' ? { stroke: AXIS, strokeDasharray: '3 3' } : { fill: 'rgba(100,116,139,0.08)' }} />
      {series.length > 1 && <Legend verticalAlign="top" align="left" iconType="circle" iconSize={8} formatter={legendFmt} wrapperStyle={{ paddingBottom: 8 }} />}
    </>
  )
  return (
    <ResponsiveContainer width="100%" height={height}>
      {kind === 'line' ? (
        <LineChart {...common}>
          {axes}
          {series.map((s) => (
            <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2} dot={data.length <= 14 ? { r: 4, stroke: '#fff', strokeWidth: 2, fill: s.color } : false} activeDot={{ r: 5, stroke: '#fff', strokeWidth: 2 }} isAnimationActive={false} />
          ))}
        </LineChart>
      ) : (
        <BarChart {...common} barCategoryGap="22%" barGap={2}>
          {axes}
          {series.map((s, i) => (
            <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} stackId={kind === 'stacked' ? 'a' : undefined} maxBarSize={36}
              stroke={kind === 'stacked' ? '#fff' : undefined} strokeWidth={kind === 'stacked' ? 2 : 0}
              radius={kind === 'stacked' ? (i === series.length - 1 ? [4, 4, 0, 0] : 0) : [4, 4, 0, 0]} isAnimationActive={false} />
          ))}
        </BarChart>
      )}
    </ResponsiveContainer>
  )
}

/** Ranked horizontal bars (countries, delivery rate) with direct value labels. */
export function HBarChart({ data, labelKey, valueKey, valueLabel, color = CHART_COLORS[0], format, max }: {
  data: Row[]; labelKey: string; valueKey: string; valueLabel: string; color?: string; format: (n: number) => string; max?: number
}) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(160, data.length * 34 + 16)}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 64, bottom: 0, left: 0 }} barCategoryGap="28%">
        <CartesianGrid stroke={GRID} strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" hide domain={[0, max ?? 'auto']} />
        <YAxis type="category" dataKey={labelKey} width={112} tick={{ fill: INK, fontSize: 12 }} tickLine={false} axisLine={false} />
        <Tooltip content={<ChartTooltip format={(n) => format(n)} />} cursor={{ fill: 'rgba(100,116,139,0.08)' }} />
        <Bar dataKey={valueKey} name={valueLabel} fill={color} radius={[0, 4, 4, 0]} maxBarSize={20} isAnimationActive={false}>
          <LabelList dataKey={valueKey} position="right" formatter={(v: unknown) => format(Number(v))} style={{ fill: INK, fontSize: 12 }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

export interface ChartTable { head: string[]; rows: (string | number)[][] }

/** Card + role="img" summary + "view as table" text alternative that every chart in the app uses. */
export function ChartFrame({ title, description, summary, table, loading, action, children, className }: {
  title: string; description?: string; summary: string; table: ChartTable; loading?: boolean; action?: ReactNode; children: ReactNode; className?: string
}) {
  return (
    <SectionCard title={title} action={action} className={className}>
      {description && <p className="-mt-1 mb-3 text-xs text-muted">{description}</p>}
      {loading ? (
        <Skeleton className="h-[260px] w-full" />
      ) : (
        <>
          <div role="img" aria-label={`${title}. ${summary}`}>{children}</div>
          <details className="group mt-3 text-xs">
            <summary className="inline-flex cursor-pointer list-none items-center gap-1 font-medium text-accent hover:underline">
              <ChevronDown size={14} strokeWidth={1.5} aria-hidden className="transition-transform group-open:rotate-180" /> View data as table
            </summary>
            <div className="mt-2 max-h-64 overflow-auto rounded-md border border-line">
              <table className="w-full text-left">
                <caption className="sr-only">{title}</caption>
                <thead className="sticky top-0 bg-subtle text-muted">
                  <tr>{table.head.map((h, i) => <th key={h} scope="col" className={`px-3 py-1.5 font-medium ${i ? 'text-right' : ''}`}>{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {table.rows.map((r, ri) => (
                    <tr key={ri}>{r.map((c, ci) => ci === 0
                      ? <th key={ci} scope="row" className="whitespace-nowrap px-3 py-1.5 font-normal">{c}</th>
                      : <td key={ci} className="px-3 py-1.5 text-right tabular-nums">{typeof c === 'number' ? c.toLocaleString('en-IN') : c}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </SectionCard>
  )
}

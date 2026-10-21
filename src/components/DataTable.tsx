import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown, Bookmark, ChevronLeft, ChevronRight, Columns3, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Popover } from '@/layout/Popover'
import { EmptyState, ErrorState, Skeleton } from './States'
import type { LucideIcon } from 'lucide-react'

export interface Column<T> {
  id: string
  header: string
  cell: (row: T) => ReactNode
  /** Sort key; omit to make the column unsortable. */
  sort?: (row: T) => string | number | undefined
  align?: 'left' | 'right'
  /** Hidden until switched on in the column chooser. */
  defaultHidden?: boolean
  /** Cannot be hidden via the column chooser. */
  locked?: boolean
  /** Do not show this column in the stacked-card layout on mobile. */
  mobileHide?: boolean
  className?: string
}

interface SavedView {
  id: string
  name: string
  search: string
  sort: { id: string; dir: 'asc' | 'desc' } | null
  hidden: string[]
  filters: unknown
}

export interface DataTableProps<T> {
  /** Unique table id; used to persist saved views and column choices. */
  id: string
  data: T[]
  columns: Column<T>[]
  rowKey: (row: T) => string
  loading?: boolean
  error?: boolean
  onRetry?: () => void
  onRowClick?: (row: T) => void
  search?: { placeholder: string; text: (row: T) => string }
  /** Filter controls rendered next to the search box. */
  filters?: ReactNode
  /** Enables saved views; pass the parent's filter state and a way to restore it. */
  views?: { filters: unknown; applyFilters: (f: unknown) => void }
  selectable?: boolean
  bulkActions?: (selected: T[], clear: () => void) => ReactNode
  empty?: { icon?: LucideIcon; title: string; hint?: string; action?: ReactNode }
  pageSize?: number
  /** Extra row class (e.g. to highlight failed rows). */
  rowClassName?: (row: T) => string | undefined
  /** Toolbar actions on the right (export, create…). */
  toolbarRight?: ReactNode
  /**
   * Server-side paging and search: `data` is the current page only. The table then neither slices, sorts nor filters rows
   * itself; it reports page, page size and the search text and shows `total` as the result count. Debounce `onQueryChange` in the caller.
   */
  remote?: { page: number; limit: number; total: number; onPageChange: (page: number) => void; onLimitChange: (limit: number) => void; onQueryChange: (q: string) => void }
}

const load = <V,>(key: string, fallback: V): V => {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as V) : fallback
  } catch {
    return fallback
  }
}
const save = (key: string, v: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(v))
  } catch {
    /* storage may be unavailable */
  }
}

export function DataTable<T>(p: DataTableProps<T>) {
  const { id, data, columns, rowKey, search, selectable, remote } = p
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<{ id: string; dir: 'asc' | 'desc' } | null>(null)
  const [hidden, setHidden] = useState<string[]>(() => load(`dt:${id}:hidden`, columns.filter((c) => c.defaultHidden).map((c) => c.id)))
  const [page, setPage] = useState(0)
  const [size, setSize] = useState(p.pageSize ?? 10)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [views, setViews] = useState<SavedView[]>(() => load(`dt:${id}:views`, []))
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => save(`dt:${id}:hidden`, hidden), [id, hidden])
  useEffect(() => save(`dt:${id}:views`, views), [id, views])

  // "/" focuses the table search
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(t.tagName) && !t.isContentEditable) {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  const visibleCols = columns.filter((c) => !hidden.includes(c.id))

  const rows = useMemo(() => {
    if (remote) return data
    let r = data
    const q = query.trim().toLowerCase()
    if (q && search) r = r.filter((x) => search.text(x).toLowerCase().includes(q))
    if (sort) {
      const col = columns.find((c) => c.id === sort.id)
      if (col?.sort) {
        const f = col.sort
        r = [...r].sort((a, b) => {
          const va = f(a), vb = f(b)
          if (va === vb) return 0
          if (va === undefined) return 1
          if (vb === undefined) return -1
          return (va < vb ? -1 : 1) * (sort.dir === 'asc' ? 1 : -1)
        })
      }
    }
    return r
  }, [data, query, sort, columns, search, remote])

  const total = remote ? remote.total : rows.length
  const pageSize = remote ? remote.limit : size
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const cur = remote ? Math.min(remote.page - 1, pages - 1) : Math.min(page, pages - 1)
  const pageRows = remote ? rows : rows.slice(cur * size, cur * size + size)
  const goTo = (n: number) => (remote ? remote.onPageChange(n + 1) : setPage(n))
  const selectedRows = data.filter((r) => selected.has(rowKey(r)))
  const allOnPage = pageRows.length > 0 && pageRows.every((r) => selected.has(rowKey(r)))

  const toggleSort = (colId: string) =>
    setSort((s) => (s?.id !== colId ? { id: colId, dir: 'asc' } : s.dir === 'asc' ? { id: colId, dir: 'desc' } : null))
  const toggleRow = (k: string) =>
    setSelected((s) => {
      const n = new Set(s)
      if (n.has(k)) n.delete(k)
      else n.add(k)
      return n
    })

  const rowClick = (e: React.MouseEvent | React.KeyboardEvent, row: T) => {
    if (!p.onRowClick) return
    if ((e.target as HTMLElement).closest('a,button,input,select,textarea,label,[data-no-row-click]')) return
    p.onRowClick(row)
  }

  const saveView = () => {
    const name = window.prompt('Name this view')
    if (!name) return
    setViews((v) => [...v, { id: String(Date.now()), name, search: query, sort, hidden, filters: p.views?.filters }])
  }
  const applyView = (v: SavedView) => {
    setQuery(v.search); setSort(v.sort); setHidden(v.hidden); p.views?.applyFilters(v.filters); setPage(0)
  }

  const th = 'sticky top-0 z-10 whitespace-nowrap border-b border-line bg-surface px-3 py-2.5 text-left text-xs font-medium text-muted'
  const colSpan = visibleCols.length + (selectable ? 1 : 0)

  return (
    <div className="card overflow-hidden">
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
        {search && (
          <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
            <Search size={15} strokeWidth={1.5} aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
            <input
              ref={searchRef}
              aria-label={search.placeholder}
              value={query}
              onChange={(e) => { setQuery(e.target.value); setPage(0); remote?.onQueryChange(e.target.value) }}
              placeholder={search.placeholder}
              className="input pl-8 pr-8"
            />
            {query ? (
              <button aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 text-faint hover:text-ink" onClick={() => { setQuery(''); remote?.onQueryChange('') }}><X size={14} /></button>
            ) : (
              <span className="kbd absolute right-2 top-1/2 -translate-y-1/2">/</span>
            )}
          </div>
        )}
        {p.filters}
        <div className="ml-auto flex items-center gap-2">
          {p.views && (
            <Popover align="right" panelClassName="w-64 p-1.5" trigger={({ toggle, props }) => (
              <button {...props} onClick={toggle} className="btn-secondary"><Bookmark size={15} strokeWidth={1.5} aria-hidden /> Views{views.length ? ` (${views.length})` : ''}</button>
            )}>
              {(close) => (
                <div className="text-sm">
                  {views.length === 0 && <p className="px-2.5 py-2 text-muted">No saved views yet.</p>}
                  {views.map((v) => (
                    <div key={v.id} className="flex items-center gap-1 rounded-md hover:bg-subtle">
                      <button className="flex-1 truncate px-2.5 py-1.5 text-left" onClick={() => { applyView(v); close() }}>{v.name}</button>
                      <button aria-label={`Delete view ${v.name}`} className="px-2 text-faint hover:text-red-600" onClick={() => setViews((x) => x.filter((y) => y.id !== v.id))}><X size={14} /></button>
                    </div>
                  ))}
                  <button className="mt-1 w-full rounded-md border-t border-line px-2.5 py-2 text-left font-medium text-accent hover:bg-subtle" onClick={() => { saveView(); close() }}>Save current view…</button>
                </div>
              )}
            </Popover>
          )}
          <Popover align="right" panelClassName="w-56 p-1.5" trigger={({ toggle, props }) => (
            <button {...props} onClick={toggle} className="btn-secondary"><Columns3 size={15} strokeWidth={1.5} aria-hidden /> Columns</button>
          )}>
            {() => (
              <div className="max-h-72 overflow-y-auto text-sm">
                {columns.map((c) => (
                  <label key={c.id} className={cn('flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 hover:bg-subtle', c.locked && 'cursor-not-allowed opacity-60')}>
                    <input type="checkbox" className="accent-indigo-600" disabled={c.locked} checked={!hidden.includes(c.id)}
                      onChange={(e) => setHidden((h) => (e.target.checked ? h.filter((x) => x !== c.id) : [...h, c.id]))} />
                    {c.header}
                  </label>
                ))}
              </div>
            )}
          </Popover>
          {p.toolbarRight}
        </div>
      </div>

      {/* bulk bar */}
      {selectable && selectedRows.length > 0 && (
        <div role="status" className="flex flex-wrap items-center gap-3 border-b border-line bg-accent-soft px-4 py-2 text-sm">
          <span className="font-medium text-accent">{selectedRows.length} selected</span>
          {p.bulkActions?.(selectedRows, () => setSelected(new Set()))}
          <button className="ml-auto text-muted hover:text-ink" onClick={() => setSelected(new Set())}>Clear</button>
        </div>
      )}

      {/* desktop table */}
      <div className="hidden max-h-[calc(100vh-290px)] min-h-[200px] overflow-auto md:block">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              {selectable && (
                <th className={cn(th, 'w-10')}>
                  <input type="checkbox" aria-label="Select all rows on this page" className="accent-indigo-600" checked={allOnPage}
                    onChange={(e) => setSelected((s) => { const n = new Set(s); pageRows.forEach((r) => (e.target.checked ? n.add(rowKey(r)) : n.delete(rowKey(r)))); return n })} />
                </th>
              )}
              {visibleCols.map((c) => {
                const active = sort?.id === c.id
                return (
                  <th key={c.id} className={cn(th, c.align === 'right' && 'text-right')} aria-sort={active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
                    {c.sort ? (
                      <button className={cn('inline-flex items-center gap-1 hover:text-ink', active && 'text-ink')} onClick={() => toggleSort(c.id)}>
                        {c.header}
                        {active ? (sort!.dir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />) : <ArrowUpDown size={12} className="text-faint" />}
                      </button>
                    ) : c.header}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {p.loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i}><td colSpan={colSpan} className="border-b border-line px-3 py-2.5"><Skeleton className="h-8 w-full" /></td></tr>
              ))
            ) : p.error ? (
              <tr><td colSpan={colSpan}><ErrorState onRetry={p.onRetry} /></td></tr>
            ) : pageRows.length === 0 ? (
              <tr><td colSpan={colSpan}><EmptyState icon={p.empty?.icon} title={p.empty?.title ?? 'Nothing here yet'} hint={p.empty?.hint ?? (query ? 'Try a different search or clear your filters.' : undefined)} action={p.empty?.action} /></td></tr>
            ) : (
              pageRows.map((row) => {
                const k = rowKey(row)
                return (
                  <tr key={k}
                    tabIndex={p.onRowClick ? 0 : undefined}
                    onClick={(e) => rowClick(e, row)}
                    onKeyDown={(e) => e.key === 'Enter' && rowClick(e, row)}
                    className={cn('group', p.onRowClick && 'cursor-pointer', selected.has(k) ? 'bg-accent-soft/60' : 'hover:bg-page', p.rowClassName?.(row))}>
                    {selectable && (
                      <td className="border-b border-line px-3" style={{ paddingBlock: 'var(--cell-py)' }}>
                        <input type="checkbox" aria-label="Select row" className="accent-indigo-600" checked={selected.has(k)} onChange={() => toggleRow(k)} />
                      </td>
                    )}
                    {visibleCols.map((c) => (
                      <td key={c.id} className={cn('border-b border-line px-3 align-top', c.align === 'right' && 'text-right', c.className)} style={{ paddingBlock: 'var(--cell-py)' }}>
                        {c.cell(row)}
                      </td>
                    ))}
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* mobile stacked cards */}
      <div className="divide-y divide-line md:hidden">
        {p.loading ? <div className="space-y-2 p-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
          : p.error ? <ErrorState onRetry={p.onRetry} />
          : pageRows.length === 0 ? <EmptyState icon={p.empty?.icon} title={p.empty?.title ?? 'Nothing here yet'} hint={p.empty?.hint} action={p.empty?.action} />
          : pageRows.map((row) => (
            <div key={rowKey(row)} tabIndex={p.onRowClick ? 0 : undefined} onClick={(e) => rowClick(e, row)} className={cn('space-y-1.5 p-3', p.onRowClick && 'cursor-pointer active:bg-subtle')}>
              {visibleCols.filter((c) => !c.mobileHide).map((c) => (
                <div key={c.id} className="flex items-start justify-between gap-3 text-sm">
                  <span className="shrink-0 text-xs text-muted">{c.header}</span>
                  <span className="min-w-0 text-right">{c.cell(row)}</span>
                </div>
              ))}
            </div>
          ))}
      </div>

      {/* pagination */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-2.5 text-sm text-muted">
        <span aria-live="polite">
          {total === 0 ? '0 results' : `${cur * pageSize + 1}–${Math.min(total, cur * pageSize + pageSize)} of ${total}`}
        </span>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2">Rows
            <select className="input !h-8 !w-auto py-0" value={pageSize} onChange={(e) => { const n = Number(e.target.value); if (remote) remote.onLimitChange(n); else { setSize(n); setPage(0) } }}>
              {[10, 25, 50].map((n) => <option key={n}>{n}</option>)}
            </select>
          </label>
          <div className="flex items-center gap-1">
            <button className="btn-secondary !h-8 !px-2" aria-label="Previous page" disabled={cur === 0} onClick={() => goTo(cur - 1)}><ChevronLeft size={16} /></button>
            <span className="px-1 text-ink">{cur + 1} / {pages}</span>
            <button className="btn-secondary !h-8 !px-2" aria-label="Next page" disabled={cur >= pages - 1} onClick={() => goTo(cur + 1)}><ChevronRight size={16} /></button>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Small labelled <select> for table filter bars. */
export function SelectFilter({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className="input !w-auto min-w-[130px]">
      <option value="">{label}: All</option>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

import { useEffect, useMemo } from 'react'
import { Command } from 'cmdk'
import { useNavigate } from 'react-router-dom'
import { CornerDownLeft, FileText, LifeBuoy, Search } from 'lucide-react'
import { SECTIONS, menuFor } from '@/navigation/nav'
import { levelForRoles } from '@/permissions/matrix'
import { useJournals, useRole, useRoles } from '@/permissions/hooks'
import { useDataStore, useSession } from '@/mock/store'
import { doiFor } from '@/shared/paperId'
import { STATUS_META } from '@/shared/statuses'
import { JournalBadge } from '@/components/Badges'
import { paperStagePath } from '@/lib/paperRoutes'
import { useUi } from './uiStore'

const itemCls = 'flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm aria-selected:bg-accent-soft aria-selected:text-accent'
const groupCls = '[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-faint'

export function CommandPalette() {
  const open = useUi((s) => s.paletteOpen)
  const setOpen = useUi((s) => s.setPalette)
  const navigate = useNavigate()
  const role = useRole()
  const roles = useRoles()
  const journals = useJournals()
  const scope = useSession((s) => s.journal)
  const papers = useDataStore((s) => s.papers)
  const tickets = useDataStore((s) => s.tickets)

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen(!useUi.getState().paletteOpen) }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [setOpen])

  const visible = (j: string) => (scope === 'ALL' ? journals.includes(j as never) : j === scope)
  const pages = useMemo(() => {
    const main = menuFor(roles).flatMap((g) => g.items.map((i) => ({ ...i, group: g.label || 'Main' })))
    const seen = new Set(main.map((m) => m.path))
    const extra = SECTIONS.filter((s) => s.roles.some((r) => roles.includes(r))).flatMap((s) => s.tabs.filter((t) => !seen.has(t.path) && levelForRoles(roles, t.area) !== 'none' && seen.add(t.path)).map((t) => ({ ...t, group: s.label })))
    return [...main, ...extra]
  }, [roles])
  const canSeePapers = levelForRoles(roles, 'submissions') !== 'none'
  const canSeeTickets = levelForRoles(roles, 'helpdesk') !== 'none'
  const go = (to: string) => { setOpen(false); navigate(to) }

  return (
    <Command.Dialog filter={(value, search) => (value.toLowerCase().includes(search.trim().toLowerCase()) ? 1 : 0)} open={open} onOpenChange={setOpen} label="Command palette" overlayClassName="fixed inset-0 z-[90] bg-slate-900/40"
      contentClassName="fixed left-1/2 top-[14vh] z-[91] w-[640px] max-w-[94vw] -translate-x-1/2 overflow-hidden rounded-lg border border-line bg-surface shadow-overlay">
      <div className="flex items-center gap-2 border-b border-line px-3">
        <Search size={16} strokeWidth={1.5} className="text-faint" aria-hidden />
        <Command.Input autoFocus placeholder="Search Paper ID, DOI, author email, ticket number — or jump to a page" className="h-12 w-full bg-transparent text-base outline-none ring-0 focus-visible:ring-0 placeholder:text-faint" />
        <span className="kbd">Esc</span>
      </div>
      <Command.List className="max-h-[50vh] overflow-y-auto p-2">
        <Command.Empty className="px-3 py-8 text-center text-sm text-muted">No matches. Try a Paper ID such as IJMAT2026000100.</Command.Empty>
        <Command.Group heading="Pages" className={groupCls}>
          {pages.map((p) => (
            <Command.Item key={p.path} value={`page ${p.label} ${p.group}`} onSelect={() => go(p.path)} className={itemCls}>
              <p.icon size={16} strokeWidth={1.5} aria-hidden />
              <span className="flex-1">{p.label}</span>
              <span className="text-xs text-muted">{p.group}</span>
            </Command.Item>
          ))}
        </Command.Group>
        {canSeePapers && (
          <Command.Group heading="Papers" className={groupCls}>
            {papers.filter((p) => visible(p.journal)).map((p) => (
              <Command.Item key={p.id} value={`${p.id} ${doiFor(p.id)} ${p.authorEmail} ${p.author} ${p.title}`} onSelect={() => go(paperStagePath(role, p))} className={itemCls}>
                <FileText size={16} strokeWidth={1.5} aria-hidden className="shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block whitespace-nowrap font-medium">{p.id}</span>
                  <span className="block truncate text-xs text-muted">{p.title} · {p.authorEmail}</span>
                </span>
                <span className="text-xs text-muted">{STATUS_META[p.status].label}</span>
                <JournalBadge code={p.journal} />
              </Command.Item>
            ))}
          </Command.Group>
        )}
        {canSeeTickets && (
          <Command.Group heading="Tickets" className={groupCls}>
            {tickets.filter((t) => visible(t.journal)).map((t) => (
              <Command.Item key={t.id} value={`${t.id} ${t.subject} ${t.requester}`} onSelect={() => go('/helpdesk')} className={itemCls}>
                <LifeBuoy size={16} strokeWidth={1.5} aria-hidden className="shrink-0" />
                <span className="min-w-0 flex-1"><span className="font-medium">{t.id}</span> <span className="text-muted">{t.subject}</span></span>
                <JournalBadge code={t.journal} />
              </Command.Item>
            ))}
          </Command.Group>
        )}
      </Command.List>
      <div className="flex items-center gap-4 border-t border-line bg-page px-3 py-2 text-xs text-muted">
        <span className="inline-flex items-center gap-1"><span className="kbd">↑↓</span> navigate</span>
        <span className="inline-flex items-center gap-1"><span className="kbd"><CornerDownLeft size={10} className="inline" /></span> open</span>
      </div>
    </Command.Dialog>
  )
}

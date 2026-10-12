import { ExternalLink } from 'lucide-react'
import { journalByCode } from '@/mock/data/core'
import { BOARD_GROUPS, type BoardMember } from '@/mock/data/website'
import type { JournalCode } from '@/shared/types'
import { formatDate } from '@/shared/formatters'
import { Avatar } from '../shared'

/** Public-site layout of the editorial board: only active members, in the saved order. */
export function BoardPreview({ journal, members }: { journal: JournalCode; members: BoardMember[] }) {
  const j = journalByCode(journal)
  const visible = members.filter((m) => m.active)
  const hidden = members.length - visible.length
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-white">
      <div className="flex items-center gap-2 border-b border-line bg-subtle px-3 py-2 text-xs text-muted">
        <span className="truncate rounded bg-surface px-2 py-0.5">https://{j.domain}/editorial-board</span>
        <span className="ml-auto whitespace-nowrap">Public preview</span>
      </div>
      <div className="border-b border-line bg-slate-900 px-6 py-4 text-white">
        <p className="text-base font-semibold">{j.name}</p>
        <p className="text-xs text-slate-300">ISSN {j.issn}</p>
      </div>
      <div className="mx-auto max-w-4xl px-6 py-8">
        <h2 className="text-2xl font-semibold tracking-tight">Editorial board</h2>
        {hidden > 0 && <p className="mt-1 text-xs text-muted">{hidden} deactivated {hidden === 1 ? 'member is' : 'members are'} not shown on the website.</p>}
        {BOARD_GROUPS.map((g) => {
          const list = visible.filter((m) => m.group === g)
          if (list.length === 0) return null
          const lead = g === 'Editor-in-Chief' || g === 'Managing Editor'
          return (
            <section key={g} className="mt-8" aria-labelledby={`pv-${g}`}>
              <h3 id={`pv-${g}`} className="border-b border-line pb-2 text-sm font-semibold uppercase tracking-wider text-muted">{g}</h3>
              <ul className={lead ? 'mt-4 space-y-4' : 'mt-4 grid gap-4 sm:grid-cols-2'}>
                {list.map((m) => (
                  <li key={m.id} className="flex gap-4">
                    <Avatar name={m.name} photo={m.photo} size={lead ? 72 : 56} />
                    <div className="min-w-0">
                      <p className="font-semibold">{m.name}</p>
                      <p className="text-sm text-muted">{m.designation}</p>
                      <p className="text-sm">{m.affiliation}, {m.country}</p>
                      {lead && m.bio && <p className="mt-1 text-sm text-muted">{m.bio}</p>}
                      <p className="mt-1 text-xs text-faint">Term: {formatDate(m.termStart)} to {formatDate(m.termEnd)}</p>
                      <p className="mt-1 flex flex-wrap gap-x-3 text-xs">
                        {m.orcid && <a className="inline-flex items-center gap-0.5 text-accent hover:underline" href={`https://orcid.org/${m.orcid}`} target="_blank" rel="noreferrer">ORCID <ExternalLink size={11} aria-hidden /></a>}
                        {m.scholar && <a className="inline-flex items-center gap-0.5 text-accent hover:underline" href={m.scholar} target="_blank" rel="noreferrer">Google Scholar <ExternalLink size={11} aria-hidden /></a>}
                        {m.scopus && <a className="inline-flex items-center gap-0.5 text-accent hover:underline" href={m.scopus} target="_blank" rel="noreferrer">Scopus <ExternalLink size={11} aria-hidden /></a>}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
        {visible.length === 0 && <p className="mt-6 text-sm text-muted">No active members. The page will be empty on the website.</p>}
      </div>
    </div>
  )
}

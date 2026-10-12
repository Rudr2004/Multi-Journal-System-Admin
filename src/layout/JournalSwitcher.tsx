import { Check, ChevronsUpDown, Layers } from 'lucide-react'
import { JOURNALS, journalByCode } from '@/mock/data/core'
import { useSession } from '@/mock/store'
import { isSuperAdmin, useCurrentUser, useJournals } from '@/permissions/hooks'
import { ROLE_META } from '@/permissions/roles'
import { JournalDot } from '@/components/Badges'
import { cn } from '@/lib/utils'
import type { JournalScope } from '@/shared/types'
import { Popover } from './Popover'

export function JournalSwitcher() {
  const user = useCurrentUser()
  const journals = useJournals()
  const scope = useSession((s) => s.journal)
  const setJournal = useSession((s) => s.setJournal)
  const superAdmin = isSuperAdmin(user)
  const current = scope === 'ALL' ? undefined : journalByCode(scope)
  const choices = JOURNALS.filter((j) => journals.includes(j.code))

  const Option = ({ value, close, children, role }: { value: JournalScope; close: () => void; children: React.ReactNode; role?: string }) => (
    <button
      role="menuitemradio" aria-checked={scope === value}
      onClick={() => { setJournal(value); close() }}
      className={cn('flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left hover:bg-subtle', scope === value && 'bg-accent-soft')}
    >
      {children}
      {role && <span className="ml-auto whitespace-nowrap text-xs text-muted">{role}</span>}
      {scope === value && <Check size={16} strokeWidth={1.5} className="shrink-0 text-accent" aria-hidden />}
    </button>
  )

  return (
    <Popover
      panelClassName="w-[360px] max-w-[92vw] p-1.5"
      trigger={({ toggle, props }) => (
        <button {...props} onClick={toggle} aria-label="Switch journal" className="btn-secondary max-w-[340px] shrink-0 gap-2.5 pr-2 2xl:max-w-[460px]">
          {current ? <JournalDot code={current.code} size={10} /> : <Layers size={15} strokeWidth={1.5} className="text-muted" aria-hidden />}
          <span className="font-semibold">{current?.code ?? 'All journals'}</span>
          {current && <span className="hidden max-w-[200px] truncate text-muted xl:inline 2xl:max-w-[360px]">{current.name}</span>}
          <ChevronsUpDown size={14} strokeWidth={1.5} className="shrink-0 text-faint" aria-hidden />
        </button>
      )}
    >
      {(close) => (
        <div role="menu" aria-label="Journals">
          <div className="px-2.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wider text-faint">Your journals</div>
          {superAdmin && (
            <Option value="ALL" close={close}>
              <Layers size={15} strokeWidth={1.5} className="text-muted" aria-hidden />
              <span className="text-sm font-medium">All journals</span>
            </Option>
          )}
          {choices.map((j) => (
            <Option key={j.code} value={j.code} close={close} role={user && ROLE_META[user.assignments[j.code]!].short}>
              <JournalDot code={j.code} size={10} />
              <span className="min-w-0">
                <span className="block text-sm font-semibold leading-4">{j.code}</span>
                <span className="block truncate text-xs text-muted">{j.name}</span>
              </span>
            </Option>
          ))}
        </div>
      )}
    </Popover>
  )
}

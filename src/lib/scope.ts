import { useMemo } from 'react'
import { useSession } from '@/mock/store'
import { useJournals } from '@/permissions/hooks'
import type { JournalCode } from '@/shared/types'

/** Journals currently in view: the selected one, or every journal the user may see for "All journals". */
export function useScopeJournals(): JournalCode[] {
  const scope = useSession((s) => s.journal)
  const journals = useJournals()
  return useMemo(() => (scope === 'ALL' ? journals : journals.includes(scope) ? [scope] : []), [scope, journals])
}

/** Filter any journal-tagged list down to the current scope. */
export function useScoped<T extends { journal: JournalCode }>(items: T[]): T[] {
  const inScope = useScopeJournals()
  return useMemo(() => items.filter((i) => inScope.includes(i.journal)), [items, inScope])
}

export const useIsAllJournals = () => useSession((s) => s.journal) === 'ALL'

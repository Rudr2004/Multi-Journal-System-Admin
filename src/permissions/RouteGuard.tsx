import type { ReactNode } from 'react'
import { ForbiddenPage } from '@/app/ErrorPages'
import { usePermission } from './hooks'
import type { Area, Level } from './matrix'

/** No access → 403 page. Navigation hides the item separately, from the same matrix. */
export function RouteGuard({ area, min = 'view', children }: { area: Area; min?: Level; children: ReactNode }) {
  const { can } = usePermission(area)
  return can(min) ? <>{children}</> : <ForbiddenPage />
}

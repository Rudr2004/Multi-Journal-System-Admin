import type { ReactElement } from 'react'
import type { Area, Level } from '@/permissions/matrix'

/** A routed screen. Every area exports a `PageDef[]` from its own routes.tsx. */
export interface PageDef {
  path: string
  area: Area
  /** minimum level needed to open the route (default 'view') */
  min?: Level
  element: ReactElement
}

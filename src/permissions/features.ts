import type { Role } from '@/shared/types'

/** Feature flags. Toggle live from the Prototype controls panel. */
export interface FeatureFlags {
  /** Review Panel Member role — scope still being confirmed with the client. */
  reviewPanel: boolean
}

export const DEFAULT_FLAGS: FeatureFlags = { reviewPanel: true }

/** Roles that only exist when a flag is on. */
export const ROLE_FLAG: Partial<Record<Role, keyof FeatureFlags>> = { panel_member: 'reviewPanel' }

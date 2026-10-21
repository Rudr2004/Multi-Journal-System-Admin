/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Origin of the platform API, without the /api/v1 path. */
  readonly VITE_PLATFORM_API_URL?: string
  /** `local` (default) shows mock data on screens without a backend; `prod` shows none. */
  readonly VITE_DEV_MODE?: 'local' | 'prod'
}

/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Origin of the platform API, without the /api/v1 path. */
  readonly VITE_PLATFORM_API_URL?: string
}

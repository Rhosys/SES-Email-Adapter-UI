/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string
  readonly VITE_AUTHRESS_LOGIN_URL: string
  readonly VITE_AUTHRESS_APPLICATION_ID: string
  readonly VITE_BASE_PATH?: string
  readonly VITE_POSTHOG_KEY?: string
  readonly VITE_POSTHOG_HOST?: string
  readonly VITE_DEPLOYMENT_FDQN?: string
  readonly VITE_LOG_TARGET?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare const VERSION_INFO: {
  releaseDate: string
  buildNumber: string
  buildRef: string
  buildCommit: string
}

declare const DEPLOYMENT_INFO: {
  FDQN: string
  LOG_TARGET: string
}

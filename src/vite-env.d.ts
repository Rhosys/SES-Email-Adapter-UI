/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string
  readonly VITE_AUTHRESS_LOGIN_URL: string
  readonly VITE_AUTHRESS_APPLICATION_ID: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

import { LoginClient } from '@authress/login'
import { clearAllPersistedCache } from '@/plugins/persistent-store'

export const loginClient = new LoginClient({
  authressApiUrl: (import.meta.env.VITE_AUTHRESS_LOGIN_URL as string) ?? 'https://login.rhosys.cloud',
  applicationId: (import.meta.env.VITE_AUTHRESS_APPLICATION_ID as string) ?? 'app_2EAWGEdtzaeCj7b45DsDtt',
})

/**
 * Sign the user out. Clears all persisted per-account store caches (threads, signals,
 * drafts, …) first so the next login can't re-hydrate another user's — or stale —
 * data, then hands off to the Authress logout redirect.
 */
export function logout(redirectUrl: string): Promise<void> {
  clearAllPersistedCache()
  return loginClient.logout(redirectUrl)
}

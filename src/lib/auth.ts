import { LoginClient } from '@authress/login'
import { queryClient } from '@/lib/queryClient'

export const loginClient = new LoginClient({
  authressApiUrl: (import.meta.env.VITE_AUTHRESS_LOGIN_URL as string) ?? 'https://login.rhosys.cloud',
  applicationId: (import.meta.env.VITE_AUTHRESS_APPLICATION_ID as string) ?? 'app_2EAWGEdtzaeCj7b45DsDtt',
})

/**
 * Sign the user out. Clears the TanStack Query cache so the next login starts
 * from a clean slate, then hands off to the Authress logout redirect.
 */
export function logout(redirectUrl: string): Promise<void> {
  queryClient.clear()
  return loginClient.logout(redirectUrl)
}

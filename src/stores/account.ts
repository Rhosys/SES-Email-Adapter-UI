import { defineStore } from 'pinia';
import type { Account } from '@/types/server';

// @authress/login is loaded lazily so this store can hydrate in environments
// (tests, SSR-style prerender) where window may not be set up yet.
let loginClient: any = null;
async function getLoginClient() {
  if (loginClient) return loginClient;
  const { LoginClient } = await import('@authress/login');
  loginClient = new LoginClient({
    authressLoginHostUrl: import.meta.env.VITE_AUTHRESS_LOGIN_URL,
    applicationId: import.meta.env.VITE_AUTHRESS_APPLICATION_ID
  });
  return loginClient;
}

interface AccountState {
  account: Account | null;
  token: string | null;
  loading: boolean;
}

export const useAccountStore = defineStore('account', {
  state: (): AccountState => ({ account: null, token: null, loading: false }),
  getters: {
    isAuthenticated: (s) => !!s.token
  },
  actions: {
    async hydrate(): Promise<void> {
      if (typeof window === 'undefined') return;
      try {
        const client = await getLoginClient();
        const session = await client.userSessionExists();
        if (session) {
          this.token = await client.getToken();
        }
      } catch {
        // Surface auth errors via the API layer; hydration must never throw.
      }
    },
    async login(): Promise<void> {
      const client = await getLoginClient();
      await client.authenticate({ connectionId: 'default' });
    },
    async logout(): Promise<void> {
      const client = await getLoginClient();
      await client.logout();
      this.token = null;
      this.account = null;
    },
    setAccount(account: Account): void {
      this.account = account;
    }
  }
});

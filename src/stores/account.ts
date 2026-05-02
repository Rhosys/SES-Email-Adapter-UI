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

const ACCOUNT_ID_KEY = 'ses-ui.account-id';

interface AccountState {
  accountId: string | null;
  account: Account | null;
  token: string | null;
  loading: boolean;
}

export const useAccountStore = defineStore('account', {
  state: (): AccountState => ({ accountId: null, account: null, token: null, loading: false }),
  getters: {
    isAuthenticated: (s) => !!s.token,
    hasAccount: (s) => !!s.accountId
  },
  actions: {
    hydrate(): void {
      if (typeof localStorage !== 'undefined') {
        this.accountId = localStorage.getItem(ACCOUNT_ID_KEY);
      }
      // Token hydration is async — callers that need it must await login().
    },
    setAccountId(accountId: string): void {
      this.accountId = accountId;
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(ACCOUNT_ID_KEY, accountId);
      }
    },
    async login(): Promise<void> {
      const client = await getLoginClient();
      await client.authenticate({ connectionId: 'default' });
      this.token = await client.getToken();
    },
    async logout(): Promise<void> {
      const client = await getLoginClient();
      await client.logout();
      this.token = null;
      this.account = null;
      this.accountId = null;
      if (typeof localStorage !== 'undefined') localStorage.removeItem(ACCOUNT_ID_KEY);
    },
    setAccount(account: Account): void {
      this.account = account;
    }
  }
});

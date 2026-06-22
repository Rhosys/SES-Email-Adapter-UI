import { useAccountStore } from '@/stores/account'

// Warren's Account
const ADMIN_ACCOUNT_IDS = new Set(["acc-t8cmlkkck3vtm"])

export function isAdminUser(): boolean {
  const accountStore = useAccountStore()
  return ADMIN_ACCOUNT_IDS.has(accountStore.accountId ?? "")
}

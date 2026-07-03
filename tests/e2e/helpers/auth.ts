import type { Page, Route } from '@playwright/test'

/**
 * Test auth helpers.
 *
 * @authress/login has no mock/inject API, but it ships a localhost login path:
 * userSessionContinuation() reads `nonce` + `access_token` + `id_token` from the
 * URL and establishes the session through its own code (cookie + localStorage).
 * We drive that path instead of writing the SDK's internal storage keys, so this
 * keeps working if the SDK changes how it persists sessions. Signatures are not
 * verified (the SDK only base64-decodes the id_token payload), so an unsigned,
 * JWT-shaped token is enough.
 *
 * The session lands in the page's storage on first navigation and persists
 * across later goto()s within the same page.
 */

/** `iss` must share a registrable domain with the app's authressApiUrl. */
const AUTHRESS_ISSUER = 'https://login.rhosys.cloud'

function base64url(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

/** Build an unsigned, JWT-shaped id token representing a logged-in user. */
function fakeIdToken(sub = 'user_test'): string {
  const header = { alg: 'none', typ: 'JWT' }
  const payload = { sub, iss: AUTHRESS_ISSUER, exp: Math.floor(Date.now() / 1000) + 3600 }
  return `${base64url(header)}.${base64url(payload)}.sig`
}

/** Minimal account whose shape satisfies the router's onboarding guard. */
const STUB_ACCOUNT = {
  accountId: 'acc_test',
  name: 'Test account',
  filtering: { defaultUnknownSenderPolicy: 'allow_all' },
  onboarding: { completed: true },
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
}

/**
 * Stub `GET /accounts` with a single onboarded account so the router guard
 * (which redirects to /onboarding when no completed account exists) lets the
 * app through. Non-GET requests fall through untouched.
 */
export async function stubAccounts(page: Page, account: object = STUB_ACCOUNT): Promise<void> {
  await page.route('**/accounts', (route: Route) => {
    if (route.request().method() !== 'GET') return route.continue()
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ accounts: [account] }),
    })
  })
}

/**
 * Navigate to `path` with the SDK's localhost login params so the session is
 * established (cookie + localStorage) before the app's router guard runs, and
 * wait until the authenticated shell has mounted. Callers that need custom API
 * stubs (accounts, threads, …) should register them before calling this.
 */
export async function gotoAuthed(page: Page, path = '/'): Promise<void> {
  const token = fakeIdToken()
  const sep = path.includes('?') ? '&' : '?'
  await page.goto(`${path}${sep}nonce=test&access_token=${token}&id_token=${token}`)

  // The sidebar (a <complementary> landmark) only mounts once authenticated and
  // past onboarding — it's absent on the standalone onboarding/login screens.
  // Wait for attachment (not visibility: it's translated off-screen on mobile).
  await page.getByRole('complementary').waitFor({ state: 'attached' })
}

/**
 * Convenience: stub the account list with a default onboarded account, then
 * establish a session and land on `path`.
 */
export async function loginAndGoto(page: Page, path = '/'): Promise<void> {
  await stubAccounts(page)
  await gotoAuthed(page, path)
}

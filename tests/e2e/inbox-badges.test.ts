import { test, expect, type Page, type Route } from '@playwright/test'
import { stubAccounts, gotoAuthed } from './helpers/auth'

/**
 * The Inbox count badge renders in two places — the sidebar nav item and the mobile
 * tab bar — and counts active threads the app has loaded. Both are one derivation over
 * the threads store, so what this guards is the wiring around it: the startup fetch
 * loads the active listing whatever page you land on, and opening another tab loads
 * that listing without displacing the active one.
 */

function thread(id: string, status: string) {
  return {
    threadId: id,
    workflow: 'conversation',
    labels: [],
    status,
    summary: `${status} thread ${id}`,
    sender: { address: `${id}@example.com` },
    lastSignalAt: '2025-01-01T12:00:00Z',
    createdAt: '2025-01-01T10:00:00Z',
    updatedAt: '2025-01-01T12:00:00Z',
  }
}

const ACTIVE = [thread('act_1', 'active'), thread('act_2', 'active'), thread('act_3', 'active')]
const ARCHIVED = [thread('arch_1', 'archived'), thread('arch_2', 'archived')]

interface ThreadRequest {
  status: string
  cursor: string | null
}

/**
 * Serve each listing separately, as the real API does — a `status=archived` request
 * knows nothing about active threads. Returns the requests made, so a test can assert
 * which listings were loaded and whether they were read from the beginning.
 */
async function stubThreads(page: Page): Promise<ThreadRequest[]> {
  const requested: ThreadRequest[] = []
  await page.route('**/accounts/*/threads*', (route: Route) => {
    const params = new URL(route.request().url()).searchParams
    const status = params.get('status')
    requested.push({ status: status ?? 'all', cursor: params.get('cursor') })
    const threads = status === 'archived' ? ARCHIVED : status === 'active' ? ACTIVE : [...ACTIVE, ...ARCHIVED]
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ threads, pagination: { cursor: null } }),
    })
  })
  await page.route('**/accounts/*/signals*', (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ signals: [], pagination: { cursor: null } }),
    }),
  )
  return requested
}

/** A count chip: a digit run with an optional "+" for a truncated listing. */
const COUNT = /^\d+\+?$/

/** The sidebar badge — rendered at every viewport (translated off-screen on mobile). */
function sidebarBadge(page: Page) {
  return page.getByRole('complementary').getByRole('link', { name: /Inbox/ }).getByText(COUNT)
}

/**
 * The bottom tab bar badge. The bar is `display: none` above Tailwind's `sm:` breakpoint,
 * so it exists to assert on only in the narrow projects — same split as the layout tests.
 */
function tabBarBadge(page: Page) {
  return page.getByRole('tablist', { name: 'Thread status' }).getByText(COUNT)
}

async function expectBothBadges(page: Page, count: string) {
  await expect(sidebarBadge(page)).toHaveText(count)
  if ((page.viewportSize()?.width ?? 0) < 640) await expect(tabBarBadge(page)).toHaveText(count)
}

function archivedTab(page: Page) {
  return page.getByRole('tab', { name: /completed or manually archived/ }).filter({ visible: true })
}

function inboxTab(page: Page) {
  return page.getByRole('tab', { name: /waiting for processing or reply/ }).filter({ visible: true })
}

test.describe('inbox notification badges', () => {
  test('keep counting active threads after switching to the Archived tab', async ({ page }) => {
    await stubAccounts(page)
    const requested = await stubThreads(page)
    await gotoAuthed(page, '/')

    await expectBothBadges(page, '3')

    await archivedTab(page).click()

    await expect(page.getByText('archived thread arch_1')).toBeVisible()
    await expectBothBadges(page, '3')
    expect(requested.map((r) => r.status)).toContain('archived')
  })

  test('count active threads when the app opens straight onto the Archived tab', async ({ page }) => {
    await stubAccounts(page)
    await stubThreads(page)
    await gotoAuthed(page, '/?tab=archived')

    await expect(page.getByText('archived thread arch_1')).toBeVisible()
    await expectBothBadges(page, '3')
  })

  test('read a listing from the beginning every time its tab is selected', async ({ page }) => {
    await stubAccounts(page)
    const requested = await stubThreads(page)
    await gotoAuthed(page, '/')

    await archivedTab(page).click()
    await expect(page.getByText('archived thread arch_1')).toBeVisible()

    await inboxTab(page).click()
    await expect(page.getByText('active thread act_1')).toBeVisible()

    await archivedTab(page).click()
    await expect(page.getByText('archived thread arch_1')).toBeVisible()

    // TanStack Query serves fresh cached data instantly (staleTime: 5s) so the
    // second archived tab switch may not trigger a new network request within
    // the test's timing. What matters: no cursor is ever sent (reads page one).
    const archived = requested.filter((r) => r.status === 'archived')
    expect(archived.length).toBeGreaterThanOrEqual(1)
    expect(archived.every((r) => r.cursor === null)).toBe(true)
    expect(requested.every((r) => r.cursor === null)).toBe(true)
    await expectBothBadges(page, '3')
  })

  test('do not load the archived listing until its tab is selected', async ({ page }) => {
    await stubAccounts(page)
    const requested = await stubThreads(page)
    await gotoAuthed(page, '/')

    await expectBothBadges(page, '3')
    expect(requested.map((r) => r.status)).not.toContain('archived')
    expect(requested.map((r) => r.status)).not.toContain('all')
  })
})

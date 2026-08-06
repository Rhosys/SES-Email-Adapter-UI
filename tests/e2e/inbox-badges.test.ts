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

/**
 * Serve each listing separately, as the real API does — a `status=archived` request
 * knows nothing about active threads. Returns the statuses requested, so a test can
 * assert which listings were loaded.
 */
async function stubThreads(page: Page): Promise<string[]> {
  const requested: string[] = []
  await page.route('**/accounts/*/threads*', (route: Route) => {
    const status = new URL(route.request().url()).searchParams.get('status')
    requested.push(status ?? 'all')
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
    expect(requested).toContain('archived')
  })

  test('count active threads when the app opens straight onto the Archived tab', async ({ page }) => {
    await stubAccounts(page)
    await stubThreads(page)
    await gotoAuthed(page, '/?tab=archived')

    await expect(page.getByText('archived thread arch_1')).toBeVisible()
    await expectBothBadges(page, '3')
  })

  test('keep each tab on its own pagination when switching back and forth', async ({ page }) => {
    await stubAccounts(page)
    const requested = await stubThreads(page)
    await gotoAuthed(page, '/')

    await archivedTab(page).click()
    await expect(page.getByText('archived thread arch_1')).toBeVisible()

    await inboxTab(page).click()
    await expect(page.getByText('active thread act_1')).toBeVisible()

    await archivedTab(page).click()
    await expect(page.getByText('archived thread arch_1')).toBeVisible()

    // Returning to a tab resumes it: its pages are already loaded and its cursor still
    // points past them, so it does not restart from the first page.
    expect(requested.filter((status) => status === 'archived')).toHaveLength(1)
    await expectBothBadges(page, '3')
  })

  test('do not load the archived listing until its tab is selected', async ({ page }) => {
    await stubAccounts(page)
    const requested = await stubThreads(page)
    await gotoAuthed(page, '/')

    await expectBothBadges(page, '3')
    expect(requested).not.toContain('archived')
    expect(requested).not.toContain('all')
  })
})

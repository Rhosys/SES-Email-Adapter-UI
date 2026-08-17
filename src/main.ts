import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { VueQueryPlugin } from '@tanstack/vue-query'
import App from './App.vue'
import { router } from './router'
import { queryClient } from './lib/queryClient'
import './assets/main.css'
import './lib/analytics'
import logger from './lib/logger'
import { loginClient } from './lib/auth'
import { useAccountStore } from './stores/account'
import { useQuarantineStore } from './stores/quarantine'
import { useThreadsStore } from './stores/threads'
import { useSignalsStore } from './stores/signals'
import { useResourcesStore } from './stores/resources'
import { useUserConfigStore } from './stores/userConfig'
import { useLogStore } from './stores/logs'
import { useIdentity } from './composables/useIdentity'
import { persistentStorePlugin } from '@/plugins/persistent-store'
import buildInfo from '@/lib/buildInfo'

function printBanner() {
  const title = "%cWelcome to Numaeel!"
  const titleStyle = "color: #cba6f7; font-size: 1.5em; font-weight: bold; font-family: monospace;"

  const body = [
    "%cYou found us! Does this page need fixes or improvements? Open an issue or report it directly to our development team. Everyone can contribute!",
    "",
    "📧 Contact the development team: support@rhosys.ch",
    "🐛 Create an issue: https://github.com/Rhosys/SES-email-adapter/issues",
    "🔒 Report a security concern: security@rhosys.ch",
    "",
    `Build: ${buildInfo.version.buildCommit} | #${buildInfo.version.buildNumber} | ref:${buildInfo.version.buildRef}`,
    `Released: ${buildInfo.version.releaseDate}`,
  ].join("\n")
  const bodyStyle = "color: #a6adc8; font-size: 12px; font-family: monospace;"

  // eslint-disable-next-line no-console
  console.log(title, titleStyle)
  // eslint-disable-next-line no-console
  console.log(body, bodyStyle)
}

printBanner()

async function enableMocking() {
  // Mock mode now uses Vite server middleware — no browser-side setup needed.
  // The Vite plugin intercepts /accounts/* requests and returns mock data directly.
}

enableMocking().then(() => {
  const pinia = createPinia()
  pinia.use(persistentStorePlugin)
  const app = createApp(App)

  app.config.errorHandler = (err, _instance, info) => {
    logger.error({ title: 'Vue error', error: err, info })
  }

  window.addEventListener('unhandledrejection', (event) => {
    logger.error({ title: 'Unhandled promise rejection', error: event.reason })
  })

  router.onError((error, to) => {
    logger.error({ title: 'Router navigation error', error, to: to.fullPath })
  })

  window.addEventListener('beforeunload', () => logger.flushOnUnload())

  app.use(pinia).use(VueQueryPlugin, { queryClient }).use(router).mount('#app')

  // Mirror recent logs into a persistent store for on-device investigation.
  // Wired eagerly (not gated on auth) so early-boot logs are captured too.
  const logStore = useLogStore()
  logger.setHistorySink((entry) => logStore.record(entry))

  const identity = useIdentity()

  // Kick off the accounts fetch immediately rather than gating it behind
  // waitForUserSession(). api.listAccounts() awaits ensureToken() internally, so the request
  // still can't leave until auth resolves — but starting it now lets the fetch fire the instant
  // the token is ready, overlapping with the Authress session check instead of running strictly
  // after it. Guards await this same promise (waitForFetch) rather than initiating their own.
  const accountStore = useAccountStore()
  accountStore.startFetch()

  // Once the account is resolved, prime all sidebar badge counters so they reflect
  // reality on first paint — regardless of which page the user navigates to first.
  accountStore.waitForFetch().then(() => {
    const quarantineStore = useQuarantineStore()
    void quarantineStore.fetchSignals()

    const resourcesStore = useResourcesStore()
    void resourcesStore.fetchResources()

    // Always the active listing, whichever page the user lands on: the sidebar badge
    // counts loaded active threads, and it renders everywhere. Archived and "All" stay
    // unfetched until their tab is selected.
    // refresh: true triggers EMX dispatch — syncs IMAP/JMAP exchanges on session start.
    const threadsStore = useThreadsStore()
    void threadsStore.fetchThreads({ status: 'active', refresh: true }).then(() => {
      // Once active threads are loaded, prefetch signals for recent ones so inline
      // workflow panels have data immediately — regardless of which page the user landed on.
      const signalsStore = useSignalsStore()
      const RECENCY_WINDOW_MS = 15 * 60 * 1000
      const now = Date.now()
      const recentThreads = threadsStore.sortedThreads
        .filter(t => t.lastSignalAt && now - new Date(t.lastSignalAt).getTime() < RECENCY_WINDOW_MS)
        .map(t => ({ threadId: t.threadId, lastSignalAt: t.lastSignalAt! }))
      if (recentThreads.length > 0) {
        void signalsStore.fetchForThreads(recentThreads)
      }
    })

    // Spam data now fetched by useSpamQuery composable in the sidebar
  })

  // Identity and user-config reads decode the session token, so they still wait for it.
  loginClient.waitForUserSession().then(() => {
    identity.load()
    if (identity.userId) {
      const userConfigStore = useUserConfigStore()
      userConfigStore.fetch(identity.userId)
    }
  })

  // Wire logger context after stores are available
  logger.setContext(() => {
    const accountStore = useAccountStore()
    return {
      userId: identity.userId ?? undefined,
      accountId: accountStore.accountId ?? undefined,
    }
  })

  // Trigger EMX sync when the user returns to the tab (visibility change) so
  // IMAP/JMAP exchanges are polled immediately rather than waiting for the next
  // 15-minute scheduler tick.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return
    const id = useAccountStore().accountId
    if (!id) return
    void useThreadsStore().fetchThreads({ status: 'active', refresh: true })
  })
})

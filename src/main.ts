import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'
import './assets/main.css'
import './lib/analytics'
import logger from './lib/logger'
import { loginClient } from './lib/auth'
import { useAccountStore } from './stores/account'
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
    "🐛 Create an issue: https://github.com/Rhosys/email-catcher/issues",
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

  app.use(pinia).use(router).mount('#app')

  // Mirror recent logs into a persistent store for on-device investigation.
  // Wired eagerly (not gated on auth) so early-boot logs are captured too.
  const logStore = useLogStore()
  logger.setHistorySink((entry) => logStore.record(entry))

  const identity = useIdentity()

  // Gate all post-auth initialization on session readiness.
  // waitForUserSession blocks until authenticate() or userSessionExists() confirms a session.
  // Once resolved, start the accounts fetch — guards will await this promise, never initiate their own.
  loginClient.waitForUserSession().then(() => {
    const accountStore = useAccountStore()
    accountStore.startFetch()

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
})

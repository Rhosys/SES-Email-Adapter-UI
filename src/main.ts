import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'
import './assets/main.css'
import './lib/analytics'
import logger from './lib/logger'
import { loginClient } from './lib/auth'
import { useAccountStore } from './stores/account'

async function enableMocking() {
  // Mock mode now uses Vite server middleware — no browser-side setup needed.
  // The Vite plugin intercepts /accounts/* requests and returns mock data directly.
}

enableMocking().then(() => {
  const pinia = createPinia()
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

  // Gate all post-auth initialization on session readiness.
  // waitForUserSession blocks until authenticate() or userSessionExists() confirms a session.
  // Once resolved, start the accounts fetch — guards will await this promise, never initiate their own.
  loginClient.waitForUserSession().then(() => {
    const accountStore = useAccountStore()
    accountStore.startFetch()
  })

  // Wire logger context after stores are available
  logger.setContext(() => {
    const accountStore = useAccountStore()
    const identity = loginClient.getUserIdentity()
    return {
      userId: (identity as { userId?: string } | null)?.userId ?? undefined,
      accountId: accountStore.accountId ?? undefined,
    }
  })
})

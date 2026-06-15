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
  if (import.meta.env.VITE_MOCK !== 'true') return
  const { worker } = await import('./mocks/browser')
  await worker.start({ onUnhandledRequest: 'bypass' })

  // Bypass auth in mock mode — stub loginClient methods so the router guard passes
  loginClient.userSessionExists = async () => true
  loginClient.ensureToken = async () => 'mock-token'
  loginClient.waitForUserSession = async () => {}
  loginClient.getUserIdentity = () => ({
    userId: 'usr_mock_123',
    sub: 'usr_mock_123',
    email: 'warren@example.com',
    name: 'Warren Parad',
    picture: null,
  })
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

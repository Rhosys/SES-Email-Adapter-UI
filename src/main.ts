import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'
import './assets/main.css'
import './lib/analytics'
import logger from './lib/logger'
import { loginClient } from './lib/auth'
import { useAccountStore } from './stores/account'

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

// Wire logger context after stores are available
logger.setContext(() => {
  const accountStore = useAccountStore()
  const identity = loginClient.getUserIdentity()
  return {
    userId: (identity as { userId?: string } | null)?.userId ?? undefined,
    accountId: accountStore.accountId ?? undefined,
  }
})

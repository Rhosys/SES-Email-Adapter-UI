import { ref, computed, reactive } from 'vue'
import { loginClient } from '@/lib/auth'
import logger from '@/lib/logger'

export interface Identity {
  userId?: string
  sub?: string
  email?: string
  name?: string
  picture?: string
}

export function useIdentity() {
  const _identity = ref<Identity | null>(null)

  function load() {
    try {
      _identity.value = loginClient.getUserIdentity() as Identity | null
    } catch (e) {
      logger.warn({ title: 'Failed to read user identity', error: e })
    }
  }

  const picture = computed(() => _identity.value?.picture ?? null)
  const displayName = computed(() => _identity.value?.name ?? _identity.value?.email ?? null)
  const userId = computed(() => _identity.value?.userId ?? _identity.value?.sub ?? null)
  const email = computed(() => _identity.value?.email ?? null)
  const initials = computed(() => {
    const n = _identity.value?.name
    if (n) {
      const parts = n.trim().split(/\s+/)
      return parts.length >= 2
        ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
        : n.slice(0, 2).toUpperCase()
    }
    const e = _identity.value?.email
    if (e) return e.slice(0, 2).toUpperCase()
    return '?'
  })

  return reactive({ picture, displayName, userId, email, initials, load })
}

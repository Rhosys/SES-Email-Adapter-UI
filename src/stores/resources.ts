import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from '@/lib/api'
import logger from '@/lib/logger'
import { useAccountStore } from '@/stores/account'
import type { Resource, ResourceStatus, ResourceWorkflow } from '@/types/server'

export const useResourcesStore = defineStore('resources', () => {
  const accountStore = useAccountStore()

  const _byAccount = ref<Record<string, Resource[]>>({})
  const loading = ref(false)
  const error = ref<string | null>(null)

  const items = computed<Resource[]>(() => {
    const id = accountStore.accountId
    if (!id) return []
    return _byAccount.value[id] ?? []
  })

  const activeResources = computed(() => items.value.filter((r) => r.status === 'active'))

  const today = computed(() => {
    const now = new Date().toISOString().slice(0, 10)
    return activeResources.value.filter((r) => r.expectedResolutionDate.slice(0, 10) <= now)
  })

  const thisWeek = computed(() => {
    const now = new Date()
    const endOfWeek = new Date(now)
    endOfWeek.setDate(now.getDate() + 7)
    const todayStr = now.toISOString().slice(0, 10)
    const weekEndStr = endOfWeek.toISOString().slice(0, 10)
    return activeResources.value.filter((r) => {
      const day = r.expectedResolutionDate.slice(0, 10)
      return day > todayStr && day <= weekEndStr
    })
  })

  const upcoming = computed(() => {
    const now = new Date()
    const endOfWeek = new Date(now)
    endOfWeek.setDate(now.getDate() + 7)
    const weekEndStr = endOfWeek.toISOString().slice(0, 10)
    return activeResources.value.filter((r) => r.expectedResolutionDate.slice(0, 10) > weekEndStr)
  })

  const byWorkflow = computed(() => {
    const grouped: Partial<Record<ResourceWorkflow, Resource[]>> = {}
    for (const r of activeResources.value) {
      const list = grouped[r.workflow] ?? []
      list.push(r)
      grouped[r.workflow] = list
    }
    return grouped
  })

  const hasResources = computed(() => activeResources.value.length > 0)

  async function fetchResources() {
    const id = accountStore.accountId
    if (!id) return
    loading.value = true
    error.value = null
    const result = await api.listResources(id, { status: 'active', limit: 100 })
    loading.value = false
    if (result.isErr()) {
      if ((_byAccount.value[id] ?? []).length > 0) {
        logger.warn({ title: 'Resources fetch failed with cache available', error: result.error.message })
      } else {
        error.value = result.error.message
      }
      return
    }
    _byAccount.value = { ..._byAccount.value, [id]: result.value.resources }
  }

  async function completeResource(resourceId: string) {
    const id = accountStore.accountId
    if (!id) return
    const existing = _byAccount.value[id] ?? []
    _byAccount.value = {
      ..._byAccount.value,
      [id]: existing.map((r) =>
        r.resourceId === resourceId ? { ...r, status: 'complete' as ResourceStatus } : r,
      ),
    }
    const result = await api.patchResource(id, resourceId, { status: 'complete' })
    if (result.isErr()) {
      _byAccount.value = { ..._byAccount.value, [id]: existing }
      logger.error({ title: 'Failed to complete resource', error: result.error.message })
    }
  }

  async function dismissResource(resourceId: string) {
    return completeResource(resourceId)
  }

  return {
    loading,
    error,
    items,
    activeResources,
    today,
    thisWeek,
    upcoming,
    byWorkflow,
    hasResources,
    fetchResources,
    completeResource,
    dismissResource,
  }
})

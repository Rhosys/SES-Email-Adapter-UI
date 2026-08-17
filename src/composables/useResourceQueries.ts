import { computed } from 'vue'
import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query'
import { useAccountStore } from '@/stores/account'
import { api, type ResourceListParams } from '@/lib/api'
import { queryKeys } from '@/lib/queryKeys'
import { unwrap } from '@/lib/queryFns'
import { dayKey } from '@/lib/resourceDate'
import type { Resource, ResourceStatus } from '@/types/server'

/**
 * Fetches active resources (sidebar badge, inbox banner).
 */
export function useActiveResourcesQuery() {
  const accountStore = useAccountStore()
  const accountId = computed(() => accountStore.accountId)
  const params: ResourceListParams = { status: 'active', limit: 100 }

  const query = useQuery({
    queryKey: computed(() => queryKeys.resources.list(accountId.value!, params)),
    queryFn: async () => unwrap(await api.listResources(accountId.value!, params)),
    enabled: computed(() => !!accountId.value),
  })

  const resources = computed<Resource[]>(() => query.data.value?.resources ?? [])
  const activeResources = computed(() => resources.value.filter((r) => r.status === 'active'))
  const hasResources = computed(() => activeResources.value.length > 0)

  return { query, resources, activeResources, hasResources }
}

/**
 * Fetches all resources (active + completed) for the full Resources view.
 * Scoped to future + past 7 days.
 */
export function useAllResourcesQuery() {
  const accountStore = useAccountStore()
  const accountId = computed(() => accountStore.accountId)

  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  const dateFrom = dayKey(sevenDaysAgo)
  const params: ResourceListParams = { dateFrom, limit: 100 }

  const query = useQuery({
    queryKey: computed(() => queryKeys.resources.list(accountId.value!, params)),
    queryFn: async () => unwrap(await api.listResources(accountId.value!, params)),
    enabled: computed(() => !!accountId.value),
  })

  const resources = computed<Resource[]>(() => query.data.value?.resources ?? [])

  return { query, resources }
}

/**
 * Mutation to change a resource's status (complete, dismiss, etc.) with
 * optimistic update across all resource queries for this account.
 */
export function useSetResourceStatus() {
  const queryClient = useQueryClient()
  const accountStore = useAccountStore()

  return useMutation({
    mutationFn: async ({ resourceId, status }: { resourceId: string; status: ResourceStatus }) =>
      unwrap(await api.patchResource(accountStore.accountId!, resourceId, { status })),
    onMutate: async ({ resourceId, status }) => {
      const accountId = accountStore.accountId!
      await queryClient.cancelQueries({ queryKey: queryKeys.resources.all(accountId) })
      const previous = queryClient.getQueriesData({ queryKey: queryKeys.resources.all(accountId) })
      queryClient.setQueriesData(
        { queryKey: queryKeys.resources.all(accountId) },
        (old: unknown) => {
          const data = old as { resources?: Resource[] } | undefined
          if (!data?.resources) return old
          return {
            ...data,
            resources: data.resources.map((r) =>
              r.resourceId === resourceId ? { ...r, status } : r,
            ),
          }
        },
      )
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        for (const [key, data] of context.previous) {
          queryClient.setQueryData(key, data)
        }
      }
    },
    onSettled: () => {
      const accountId = accountStore.accountId!
      void queryClient.invalidateQueries({ queryKey: queryKeys.resources.all(accountId) })
    },
  })
}

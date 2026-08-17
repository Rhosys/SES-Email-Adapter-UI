import { computed } from 'vue'
import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query'
import { useAccountStore } from '@/stores/account'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/queryKeys'
import { unwrap } from '@/lib/queryFns'
import type { Label } from '@/types/server'

export function useLabelsQuery() {
  const accountStore = useAccountStore()
  const accountId = computed(() => accountStore.accountId)

  const query = useQuery({
    queryKey: computed(() => queryKeys.labels.all(accountId.value!)),
    queryFn: async () => unwrap(await api.listLabels(accountId.value!)),
    enabled: computed(() => !!accountId.value),
  })

  const labels = computed<Label[]>(() => query.data.value ?? [])

  return { query, labels }
}

export function useCreateLabel() {
  const queryClient = useQueryClient()
  const accountStore = useAccountStore()

  return useMutation({
    mutationFn: async (body: { name: string; applyInstruction: string; color?: string; icon?: string }) =>
      unwrap(await api.createLabel(accountStore.accountId!, body)),
    onSettled: () => {
      const accountId = accountStore.accountId!
      void queryClient.invalidateQueries({ queryKey: queryKeys.labels.all(accountId) })
    },
  })
}

export function useUpdateLabel() {
  const queryClient = useQueryClient()
  const accountStore = useAccountStore()

  return useMutation({
    mutationFn: async ({ labelKey, body }: { labelKey: string; body: { name?: string; applyInstruction?: string; color?: string; icon?: string } }) =>
      unwrap(await api.updateLabel(accountStore.accountId!, labelKey, body)),
    onMutate: async ({ labelKey, body }) => {
      const accountId = accountStore.accountId!
      await queryClient.cancelQueries({ queryKey: queryKeys.labels.all(accountId) })
      const previous = queryClient.getQueryData<Label[]>(queryKeys.labels.all(accountId))
      queryClient.setQueryData<Label[]>(queryKeys.labels.all(accountId), (old) => {
        if (!old) return old
        return old.map((l) => (l.label === labelKey ? { ...l, ...body } : l))
      })
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        const accountId = accountStore.accountId!
        queryClient.setQueryData(queryKeys.labels.all(accountId), context.previous)
      }
    },
    onSettled: () => {
      const accountId = accountStore.accountId!
      void queryClient.invalidateQueries({ queryKey: queryKeys.labels.all(accountId) })
    },
  })
}

export function useDeleteLabel() {
  const queryClient = useQueryClient()
  const accountStore = useAccountStore()

  return useMutation({
    mutationFn: async (labelKey: string) =>
      unwrap(await api.deleteLabel(accountStore.accountId!, labelKey)),
    onMutate: async (labelKey) => {
      const accountId = accountStore.accountId!
      await queryClient.cancelQueries({ queryKey: queryKeys.labels.all(accountId) })
      const previous = queryClient.getQueryData<Label[]>(queryKeys.labels.all(accountId))
      queryClient.setQueryData<Label[]>(queryKeys.labels.all(accountId), (old) => {
        if (!old) return old
        return old.filter((l) => l.label !== labelKey)
      })
      return { previous }
    },
    onError: (_err, _labelKey, context) => {
      if (context?.previous) {
        const accountId = accountStore.accountId!
        queryClient.setQueryData(queryKeys.labels.all(accountId), context.previous)
      }
    },
    onSettled: () => {
      const accountId = accountStore.accountId!
      void queryClient.invalidateQueries({ queryKey: queryKeys.labels.all(accountId) })
    },
  })
}

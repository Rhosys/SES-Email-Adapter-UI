import { computed } from 'vue'
import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query'
import { useAccountStore } from '@/stores/account'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/queryKeys'
import { unwrap } from '@/lib/queryFns'
import type { CreateViewBody, View } from '@/types/server'

export function useViewsQuery() {
  const accountStore = useAccountStore()
  const accountId = computed(() => accountStore.accountId)

  const query = useQuery({
    queryKey: computed(() => queryKeys.views.all(accountId.value!)),
    queryFn: async () => unwrap(await api.listViews(accountId.value!)),
    enabled: computed(() => !!accountId.value),
  })

  const views = computed<View[]>(() =>
    [...(query.data.value ?? [])].sort((a, b) => a.position - b.position),
  )

  return { query, views, sortedViews: views }
}

export function useCreateView() {
  const queryClient = useQueryClient()
  const accountStore = useAccountStore()

  return useMutation({
    mutationFn: async (body: CreateViewBody) =>
      unwrap(await api.createView(accountStore.accountId!, body)),
    onSettled: () => {
      const accountId = accountStore.accountId!
      void queryClient.invalidateQueries({ queryKey: queryKeys.views.all(accountId) })
    },
  })
}

export function useUpdateView() {
  const queryClient = useQueryClient()
  const accountStore = useAccountStore()

  return useMutation({
    mutationFn: async ({ viewId, body }: { viewId: string; body: Partial<CreateViewBody> }) =>
      unwrap(await api.updateView(accountStore.accountId!, viewId, body)),
    onMutate: async ({ viewId, body }) => {
      const accountId = accountStore.accountId!
      await queryClient.cancelQueries({ queryKey: queryKeys.views.all(accountId) })
      const previous = queryClient.getQueryData<View[]>(queryKeys.views.all(accountId))
      queryClient.setQueryData<View[]>(queryKeys.views.all(accountId), (old) => {
        if (!old) return old
        return old.map((v) => (v.viewId === viewId ? { ...v, ...body } : v))
      })
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        const accountId = accountStore.accountId!
        queryClient.setQueryData(queryKeys.views.all(accountId), context.previous)
      }
    },
    onSettled: () => {
      const accountId = accountStore.accountId!
      void queryClient.invalidateQueries({ queryKey: queryKeys.views.all(accountId) })
    },
  })
}

export function useReorderViews() {
  const queryClient = useQueryClient()
  const accountStore = useAccountStore()

  return useMutation({
    mutationFn: async ({ sourceId, targetId }: { sourceId: string; targetId: string }) => {
      const accountId = accountStore.accountId!
      const views = queryClient.getQueryData<View[]>(queryKeys.views.all(accountId)) ?? []
      const sourceView = views.find((v) => v.viewId === sourceId)
      const targetView = views.find((v) => v.viewId === targetId)
      if (!sourceView || !targetView) return

      const [resA, resB] = await Promise.all([
        api.updateView(accountId, sourceId, { position: targetView.position }),
        api.updateView(accountId, targetId, { position: sourceView.position }),
      ])
      unwrap(resA)
      unwrap(resB)
    },
    onMutate: async ({ sourceId, targetId }) => {
      const accountId = accountStore.accountId!
      await queryClient.cancelQueries({ queryKey: queryKeys.views.all(accountId) })
      const previous = queryClient.getQueryData<View[]>(queryKeys.views.all(accountId))
      queryClient.setQueryData<View[]>(queryKeys.views.all(accountId), (old) => {
        if (!old) return old
        const sourceView = old.find((v) => v.viewId === sourceId)
        const targetView = old.find((v) => v.viewId === targetId)
        if (!sourceView || !targetView) return old
        const sourcePos = sourceView.position
        const targetPos = targetView.position
        return old.map((v) => {
          if (v.viewId === sourceId) return { ...v, position: targetPos }
          if (v.viewId === targetId) return { ...v, position: sourcePos }
          return v
        })
      })
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        const accountId = accountStore.accountId!
        queryClient.setQueryData(queryKeys.views.all(accountId), context.previous)
      }
    },
    onSettled: () => {
      const accountId = accountStore.accountId!
      void queryClient.invalidateQueries({ queryKey: queryKeys.views.all(accountId) })
    },
  })
}

export function useDeleteView() {
  const queryClient = useQueryClient()
  const accountStore = useAccountStore()

  return useMutation({
    mutationFn: async (viewId: string) =>
      unwrap(await api.deleteView(accountStore.accountId!, viewId)),
    onMutate: async (viewId) => {
      const accountId = accountStore.accountId!
      await queryClient.cancelQueries({ queryKey: queryKeys.views.all(accountId) })
      const previous = queryClient.getQueryData<View[]>(queryKeys.views.all(accountId))
      queryClient.setQueryData<View[]>(queryKeys.views.all(accountId), (old) => {
        if (!old) return old
        return old.filter((v) => v.viewId !== viewId)
      })
      return { previous }
    },
    onError: (_err, _viewId, context) => {
      if (context?.previous) {
        const accountId = accountStore.accountId!
        queryClient.setQueryData(queryKeys.views.all(accountId), context.previous)
      }
    },
    onSettled: () => {
      const accountId = accountStore.accountId!
      void queryClient.invalidateQueries({ queryKey: queryKeys.views.all(accountId) })
    },
  })
}

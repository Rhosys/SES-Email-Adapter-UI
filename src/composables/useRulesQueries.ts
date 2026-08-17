import { computed } from 'vue'
import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query'
import { useAccountStore } from '@/stores/account'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/queryKeys'
import { unwrap } from '@/lib/queryFns'
import type { CreateRuleBody, Rule, UpdateRuleBody } from '@/types/server'

export function useRulesQuery() {
  const accountStore = useAccountStore()
  const accountId = computed(() => accountStore.accountId)

  const query = useQuery({
    queryKey: computed(() => queryKeys.rules.all(accountId.value!)),
    queryFn: async () => unwrap(await api.listRules(accountId.value!)),
    enabled: computed(() => !!accountId.value),
  })

  const rules = computed<Rule[]>(() =>
    [...(query.data.value ?? [])].sort((a, b) => a.priorityOrder - b.priorityOrder),
  )

  return { query, rules }
}

export function useCreateRule() {
  const queryClient = useQueryClient()
  const accountStore = useAccountStore()

  return useMutation({
    mutationFn: async (body: CreateRuleBody) =>
      unwrap(await api.createRule(accountStore.accountId!, body)),
    onSettled: () => {
      const accountId = accountStore.accountId!
      void queryClient.invalidateQueries({ queryKey: queryKeys.rules.all(accountId) })
    },
  })
}

export function useUpdateRule() {
  const queryClient = useQueryClient()
  const accountStore = useAccountStore()

  return useMutation({
    mutationFn: async ({ ruleId, body }: { ruleId: string; body: UpdateRuleBody }) =>
      unwrap(await api.updateRule(accountStore.accountId!, ruleId, body)),
    onMutate: async ({ ruleId, body }) => {
      const accountId = accountStore.accountId!
      await queryClient.cancelQueries({ queryKey: queryKeys.rules.all(accountId) })
      const previous = queryClient.getQueryData<Rule[]>(queryKeys.rules.all(accountId))
      queryClient.setQueryData<Rule[]>(queryKeys.rules.all(accountId), (old) => {
        if (!old) return old
        return old.map((r) => (r.ruleId === ruleId ? { ...r, ...body } : r))
      })
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        const accountId = accountStore.accountId!
        queryClient.setQueryData(queryKeys.rules.all(accountId), context.previous)
      }
    },
    onSettled: () => {
      const accountId = accountStore.accountId!
      void queryClient.invalidateQueries({ queryKey: queryKeys.rules.all(accountId) })
    },
  })
}

export function useDeleteRule() {
  const queryClient = useQueryClient()
  const accountStore = useAccountStore()

  return useMutation({
    mutationFn: async (ruleId: string) =>
      unwrap(await api.deleteRule(accountStore.accountId!, ruleId)),
    onMutate: async (ruleId) => {
      const accountId = accountStore.accountId!
      await queryClient.cancelQueries({ queryKey: queryKeys.rules.all(accountId) })
      const previous = queryClient.getQueryData<Rule[]>(queryKeys.rules.all(accountId))
      queryClient.setQueryData<Rule[]>(queryKeys.rules.all(accountId), (old) => {
        if (!old) return old
        return old.filter((r) => r.ruleId !== ruleId)
      })
      return { previous }
    },
    onError: (_err, _ruleId, context) => {
      if (context?.previous) {
        const accountId = accountStore.accountId!
        queryClient.setQueryData(queryKeys.rules.all(accountId), context.previous)
      }
    },
    onSettled: () => {
      const accountId = accountStore.accountId!
      void queryClient.invalidateQueries({ queryKey: queryKeys.rules.all(accountId) })
    },
  })
}

export function useReorderRules() {
  const queryClient = useQueryClient()
  const accountStore = useAccountStore()

  return useMutation({
    mutationFn: async ({ dragId, targetId }: { dragId: string; targetId: string }) => {
      const accountId = accountStore.accountId!
      const rules = queryClient.getQueryData<Rule[]>(queryKeys.rules.all(accountId)) ?? []
      const dragRule = rules.find((r) => r.ruleId === dragId)
      const targetRule = rules.find((r) => r.ruleId === targetId)
      if (!dragRule || !targetRule) return

      const [resA, resB] = await Promise.all([
        api.updateRule(accountId, dragId, { priorityOrder: targetRule.priorityOrder }),
        api.updateRule(accountId, targetId, { priorityOrder: dragRule.priorityOrder }),
      ])
      unwrap(resA)
      unwrap(resB)
    },
    onMutate: async ({ dragId, targetId }) => {
      const accountId = accountStore.accountId!
      await queryClient.cancelQueries({ queryKey: queryKeys.rules.all(accountId) })
      const previous = queryClient.getQueryData<Rule[]>(queryKeys.rules.all(accountId))
      queryClient.setQueryData<Rule[]>(queryKeys.rules.all(accountId), (old) => {
        if (!old) return old
        const dragRule = old.find((r) => r.ruleId === dragId)
        const targetRule = old.find((r) => r.ruleId === targetId)
        if (!dragRule || !targetRule) return old
        const dragOrder = dragRule.priorityOrder
        const targetOrder = targetRule.priorityOrder
        return old.map((r) => {
          if (r.ruleId === dragId) return { ...r, priorityOrder: targetOrder }
          if (r.ruleId === targetId) return { ...r, priorityOrder: dragOrder }
          return r
        })
      })
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        const accountId = accountStore.accountId!
        queryClient.setQueryData(queryKeys.rules.all(accountId), context.previous)
      }
    },
    onSettled: () => {
      const accountId = accountStore.accountId!
      void queryClient.invalidateQueries({ queryKey: queryKeys.rules.all(accountId) })
    },
  })
}

export function useMoveRule() {
  const queryClient = useQueryClient()
  const accountStore = useAccountStore()

  return useMutation({
    mutationFn: async ({ aId, bId, aPriority, bPriority }: { ruleId: string; direction: -1 | 1; aId: string; bId: string; aPriority: number; bPriority: number }) => {
      const accountId = accountStore.accountId!
      const [resA, resB] = await Promise.all([
        api.updateRule(accountId, aId, { priorityOrder: bPriority }),
        api.updateRule(accountId, bId, { priorityOrder: aPriority }),
      ])
      unwrap(resA)
      unwrap(resB)
    },
    onMutate: async ({ ruleId, direction }) => {
      const accountId = accountStore.accountId!
      await queryClient.cancelQueries({ queryKey: queryKeys.rules.all(accountId) })
      const previous = queryClient.getQueryData<Rule[]>(queryKeys.rules.all(accountId))
      queryClient.setQueryData<Rule[]>(queryKeys.rules.all(accountId), (old) => {
        if (!old) return old
        const sorted = [...old].sort((a, b) => a.priorityOrder - b.priorityOrder)
        const idx = sorted.findIndex((r) => r.ruleId === ruleId)
        const swapIdx = idx + direction
        if (idx < 0 || swapIdx < 0 || swapIdx >= sorted.length) return old
        const a = sorted[idx]
        const b = sorted[swapIdx]
        return old.map((r) => {
          if (r.ruleId === a.ruleId) return { ...r, priorityOrder: b.priorityOrder }
          if (r.ruleId === b.ruleId) return { ...r, priorityOrder: a.priorityOrder }
          return r
        })
      })
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        const accountId = accountStore.accountId!
        queryClient.setQueryData(queryKeys.rules.all(accountId), context.previous)
      }
    },
    onSettled: () => {
      const accountId = accountStore.accountId!
      void queryClient.invalidateQueries({ queryKey: queryKeys.rules.all(accountId) })
    },
  })
}

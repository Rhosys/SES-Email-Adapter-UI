import { computed } from 'vue'
import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query'
import { useAccountStore } from '@/stores/account'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/queryKeys'
import { unwrap } from '@/lib/queryFns'
import type { EmailTemplate, TemplateFunction } from '@/types/server'

interface TemplateBody {
  name: string
  subject: string
  body: string
  functions: TemplateFunction[]
}

export function useTemplatesQuery() {
  const accountStore = useAccountStore()
  const accountId = computed(() => accountStore.accountId)

  const query = useQuery({
    queryKey: computed(() => queryKeys.templates.all(accountId.value!)),
    queryFn: async () => unwrap(await api.listTemplates(accountId.value!)),
    enabled: computed(() => !!accountId.value),
  })

  const templates = computed<EmailTemplate[]>(() => query.data.value ?? [])

  return { query, templates }
}

export function useCreateTemplate() {
  const queryClient = useQueryClient()
  const accountStore = useAccountStore()

  return useMutation({
    mutationFn: async (body: TemplateBody) =>
      unwrap(await api.createTemplate(accountStore.accountId!, body)),
    onSettled: () => {
      const accountId = accountStore.accountId!
      void queryClient.invalidateQueries({ queryKey: queryKeys.templates.all(accountId) })
    },
  })
}

export function useUpdateTemplate() {
  const queryClient = useQueryClient()
  const accountStore = useAccountStore()

  return useMutation({
    mutationFn: async ({ templateId, body }: { templateId: string; body: TemplateBody }) =>
      unwrap(await api.updateTemplate(accountStore.accountId!, templateId, body)),
    onMutate: async ({ templateId, body }) => {
      const accountId = accountStore.accountId!
      await queryClient.cancelQueries({ queryKey: queryKeys.templates.all(accountId) })
      const previous = queryClient.getQueryData<EmailTemplate[]>(queryKeys.templates.all(accountId))
      queryClient.setQueryData<EmailTemplate[]>(queryKeys.templates.all(accountId), (old) => {
        if (!old) return old
        return old.map((t) => (t.templateId === templateId ? { ...t, ...body } : t))
      })
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        const accountId = accountStore.accountId!
        queryClient.setQueryData(queryKeys.templates.all(accountId), context.previous)
      }
    },
    onSettled: () => {
      const accountId = accountStore.accountId!
      void queryClient.invalidateQueries({ queryKey: queryKeys.templates.all(accountId) })
    },
  })
}

export function useDeleteTemplate() {
  const queryClient = useQueryClient()
  const accountStore = useAccountStore()

  return useMutation({
    mutationFn: async (templateId: string) =>
      unwrap(await api.deleteTemplate(accountStore.accountId!, templateId)),
    onMutate: async (templateId) => {
      const accountId = accountStore.accountId!
      await queryClient.cancelQueries({ queryKey: queryKeys.templates.all(accountId) })
      const previous = queryClient.getQueryData<EmailTemplate[]>(queryKeys.templates.all(accountId))
      queryClient.setQueryData<EmailTemplate[]>(queryKeys.templates.all(accountId), (old) => {
        if (!old) return old
        return old.filter((t) => t.templateId !== templateId)
      })
      return { previous }
    },
    onError: (_err, _templateId, context) => {
      if (context?.previous) {
        const accountId = accountStore.accountId!
        queryClient.setQueryData(queryKeys.templates.all(accountId), context.previous)
      }
    },
    onSettled: () => {
      const accountId = accountStore.accountId!
      void queryClient.invalidateQueries({ queryKey: queryKeys.templates.all(accountId) })
    },
  })
}

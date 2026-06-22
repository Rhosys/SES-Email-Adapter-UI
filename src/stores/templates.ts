import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { ok, err, type Result } from 'neverthrow'
import { api, ApiError } from '@/lib/api'
import { useAccountStore } from '@/stores/account'
import { NoCurrentAccountError } from '@/stores/errors'
import type { EmailTemplate, TemplateFunction } from '@/types/server'

interface TemplateBody {
  name: string
  subject: string
  body: string
  functions: TemplateFunction[]
}

export const useTemplatesStore = defineStore('templates', () => {
  const accountStore = useAccountStore()

  const _byAccount = ref<Record<string, EmailTemplate[]>>({})
  const templates = computed<EmailTemplate[]>(() => accountStore.accountId ? (_byAccount.value[accountStore.accountId] ?? []) : [])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchTemplates() {
    const id = accountStore.accountId
    if (!id) return
    loading.value = true
    error.value = null
    const result = await api.listTemplates(id)
    loading.value = false
    if (result.isErr()) { error.value = result.error.message; return }
    _byAccount.value = { ..._byAccount.value, [id]: result.value }
  }

  async function createTemplate(body: TemplateBody): Promise<Result<EmailTemplate, ApiError | NoCurrentAccountError>> {
    const id = accountStore.accountId
    if (!id) return err(new NoCurrentAccountError())
    error.value = null
    const result = await api.createTemplate(id, body)
    if (result.isErr()) { error.value = result.error.message; return err(result.error) }
    _byAccount.value = { ..._byAccount.value, [id]: [result.value, ...(_byAccount.value[id] ?? [])] }
    return ok(result.value)
  }

  async function updateTemplate(templateId: string, body: TemplateBody): Promise<Result<EmailTemplate, ApiError | NoCurrentAccountError>> {
    const id = accountStore.accountId
    if (!id) return err(new NoCurrentAccountError())
    error.value = null
    const result = await api.updateTemplate(id, templateId, body)
    if (result.isErr()) { error.value = result.error.message; return err(result.error) }
    _byAccount.value = { ..._byAccount.value, [id]: (_byAccount.value[id] ?? []).map((t) => (t.templateId === templateId ? result.value : t)) }
    return ok(result.value)
  }

  async function deleteTemplate(templateId: string): Promise<Result<void, ApiError | NoCurrentAccountError>> {
    const id = accountStore.accountId
    if (!id) return err(new NoCurrentAccountError())
    error.value = null
    const result = await api.deleteTemplate(id, templateId)
    if (result.isErr() && result.error.status !== 404) { error.value = result.error.message; return err(result.error) }
    _byAccount.value = { ..._byAccount.value, [id]: (_byAccount.value[id] ?? []).filter((t) => t.templateId !== templateId) }
    return ok(undefined)
  }

  function clearError() {
    error.value = null
  }

  return { templates, loading, error, fetchTemplates, createTemplate, updateTemplate, deleteTemplate, clearError }
}, {
  persist: {
    accountKeyedRef: '_byAccount',
  },
})

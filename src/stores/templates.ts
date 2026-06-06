import { defineStore } from 'pinia'
import { ref } from 'vue'
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

  const templates = ref<EmailTemplate[]>([])
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
    templates.value = result.value
  }

  async function createTemplate(body: TemplateBody): Promise<Result<EmailTemplate, ApiError | NoCurrentAccountError>> {
    const id = accountStore.accountId
    if (!id) return err(new NoCurrentAccountError())
    error.value = null
    const result = await api.createTemplate(id, body)
    if (result.isErr()) { error.value = result.error.message; return err(result.error) }
    templates.value = [result.value, ...templates.value]
    return ok(result.value)
  }

  async function updateTemplate(templateId: string, body: TemplateBody): Promise<Result<EmailTemplate, ApiError | NoCurrentAccountError>> {
    const id = accountStore.accountId
    if (!id) return err(new NoCurrentAccountError())
    error.value = null
    const result = await api.updateTemplate(id, templateId, body)
    if (result.isErr()) { error.value = result.error.message; return err(result.error) }
    templates.value = templates.value.map((t) => (t.templateId === templateId ? result.value : t))
    return ok(result.value)
  }

  async function deleteTemplate(templateId: string): Promise<Result<void, ApiError | NoCurrentAccountError>> {
    const id = accountStore.accountId
    if (!id) return err(new NoCurrentAccountError())
    error.value = null
    const result = await api.deleteTemplate(id, templateId)
    if (result.isErr()) { error.value = result.error.message; return err(result.error) }
    templates.value = templates.value.filter((t) => t.templateId !== templateId)
    return ok(undefined)
  }

  function clearError() {
    error.value = null
  }

  return { templates, loading, error, fetchTemplates, createTemplate, updateTemplate, deleteTemplate, clearError }
})

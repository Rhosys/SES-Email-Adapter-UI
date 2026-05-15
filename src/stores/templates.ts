import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from '@/lib/api'
import { useAccountStore } from '@/stores/account'
import type { EmailTemplate } from '@/types/server'

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

  async function createTemplate(body: {
    name: string
    subject: string
    body: string
  }): Promise<EmailTemplate | null> {
    const id = accountStore.accountId
    if (!id) return null
    error.value = null
    const result = await api.createTemplate(id, body)
    if (result.isErr()) { error.value = result.error.message; return null }
    templates.value = [result.value, ...templates.value]
    return result.value
  }

  async function updateTemplate(
    templateId: string,
    body: { name: string; subject: string; body: string },
  ): Promise<boolean> {
    const id = accountStore.accountId
    if (!id) return false
    error.value = null
    const result = await api.updateTemplate(id, templateId, body)
    if (result.isErr()) { error.value = result.error.message; return false }
    templates.value = templates.value.map((t) => (t.id === templateId ? result.value : t))
    return true
  }

  async function deleteTemplate(templateId: string): Promise<boolean> {
    const id = accountStore.accountId
    if (!id) return false
    error.value = null
    const result = await api.deleteTemplate(id, templateId)
    if (result.isErr()) { error.value = result.error.message; return false }
    templates.value = templates.value.filter((t) => t.id !== templateId)
    return true
  }

  function clearError() {
    error.value = null
  }

  return { templates, loading, error, fetchTemplates, createTemplate, updateTemplate, deleteTemplate, clearError }
})

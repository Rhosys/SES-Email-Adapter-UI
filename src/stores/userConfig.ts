import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { api } from '@/lib/api'
import type { UserConfiguration, PostSendView } from '@/types/server'

const DEFAULTS: UserConfiguration = { postSendView: 'return_to_inbox' }

export const useUserConfigStore = defineStore('userConfig', () => {
  const _config = ref<UserConfiguration>({ ...DEFAULTS })
  const _userId = ref<string | null>(null)

  const postSendView = computed<PostSendView>(() => _config.value.postSendView)

  async function fetch(userId: string) {
    _userId.value = userId
    const result = await api.getUserConfiguration(userId)
    if (result.isOk()) {
      _config.value = result.value
    }
  }

  async function update(patch: Partial<UserConfiguration>) {
    if (!_userId.value) return
    const result = await api.updateUserConfiguration(_userId.value, patch)
    if (result.isOk()) {
      _config.value = result.value
    }
  }

  return { postSendView, fetch, update }
})

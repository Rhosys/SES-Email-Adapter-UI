<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { api } from '@/lib/api'
import { useAccountStore } from '@/stores/account'
import ResourcePanel from '@/components/ResourcePanel.vue'
import type { Resource, ResourceStatus } from '@/types/server'

const props = defineProps<{ threadId: string }>()

const accountStore = useAccountStore()
const resources = ref<Resource[]>([])

async function fetchResources() {
  const accountId = accountStore.accountId
  if (!accountId) return
  const result = await api.listResourcesByThread(accountId, props.threadId)
  if (result.isOk()) {
    resources.value = result.value.resources
  }
}

async function handleToggle(resourceId: string, newStatus: ResourceStatus) {
  const accountId = accountStore.accountId
  if (!accountId) return
  resources.value = resources.value.map((r) =>
    r.resourceId === resourceId ? { ...r, status: newStatus } : r,
  )
  const result = await api.patchResource(accountId, resourceId, { status: newStatus })
  if (result.isErr()) {
    await fetchResources()
  }
}

onMounted(() => {
  void fetchResources()
})
</script>

<template>
  <div v-if="resources.length > 0" class="mb-6 rounded-lg border border-ctp-surface0 bg-ctp-mantle p-4">
    <ResourcePanel
      :resources="resources"
      @toggle-status="handleToggle"
    />
  </div>
</template>

<script setup lang="ts">
import ResourcePanel from '@/components/ResourcePanel.vue'
import { useSetResourceStatus } from '@/composables/useResourceQueries'
import type { Resource, ResourceStatus } from '@/types/server'

defineProps<{ resources: Resource[] }>()

const setStatus = useSetResourceStatus()

function handleToggle(resourceId: string, newStatus: ResourceStatus) {
  setStatus.mutate({ resourceId, status: newStatus })
}
</script>

<template>
  <div v-if="resources.length > 0" class="mb-6 rounded-lg border border-ctp-surface0 bg-ctp-mantle p-4">
    <ResourcePanel
      :resources="resources"
      @toggle-status="handleToggle"
    />
  </div>
</template>

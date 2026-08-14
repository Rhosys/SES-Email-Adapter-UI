<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useResourcesStore } from '@/stores/resources'
import ResourcePanel from '@/components/ResourcePanel.vue'
import type { ResourceStatus } from '@/types/server'

const resourcesStore = useResourcesStore()
const expanded = ref(true)

onMounted(() => {
  void resourcesStore.fetchResources()
})

function handleToggle(resourceId: string, newStatus: ResourceStatus) {
  void resourcesStore.setResourceStatus(resourceId, newStatus)
}
</script>

<template>
  <div
    v-if="resourcesStore.hasResources"
    class="resources-banner mb-4 rounded-lg border border-ctp-surface0 bg-ctp-mantle transition-colors hover:border-ctp-surface1"
  >
    <button
      type="button"
      class="flex w-full items-center justify-between px-3 py-2 text-left"
      :aria-expanded="expanded"
      aria-label="Toggle resources"
      @click="expanded = !expanded"
    >
      <span class="flex items-center gap-2 text-xs font-medium text-ctp-subtext0 transition-colors hover:text-ctp-text">
        Upcoming
        <span class="rounded-full bg-ctp-mauve/20 px-1.5 py-0.5 text-[10px] font-semibold text-ctp-mauve">
          {{ resourcesStore.activeResources.length }}
        </span>
      </span>
      <svg
        xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
        fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
        class="shrink-0 text-ctp-subtext0 transition-transform"
        :class="{ 'rotate-180': expanded }"
        aria-hidden="true"
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </button>

    <div v-if="expanded" class="px-3 pb-3">
      <ResourcePanel
        :resources="resourcesStore.activeResources"
        show-thread-link
        @toggle-status="handleToggle"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useResourcesStore } from '@/stores/resources'
import ResourcePanel from '@/components/ResourcePanel.vue'
import type { ResourceStatus } from '@/types/server'

const resourcesStore = useResourcesStore()

onMounted(() => {
  void resourcesStore.fetchAllResources()
})

function handleToggle(resourceId: string, newStatus: ResourceStatus) {
  void resourcesStore.setResourceStatus(resourceId, newStatus)
}
</script>

<template>
  <div>
    <header class="border-b border-ctp-surface0 bg-ctp-mantle px-4 py-3">
      <h1 class="hidden text-lg font-semibold sm:block">Resources</h1>
      <p class="mt-0.5 text-xs text-ctp-subtext0">
        Packages, trips, bills, and other threads waiting on you
      </p>
    </header>

    <main class="mx-auto max-w-3xl px-4 py-4">
      <div
        v-if="resourcesStore.error"
        class="mb-4 rounded-lg border border-ctp-red bg-ctp-red/10 px-4 py-3 text-sm text-ctp-red"
      >
        {{ resourcesStore.error }}
      </div>

      <div
        v-if="!resourcesStore.loading && resourcesStore.items.length === 0"
        class="py-20 text-center text-ctp-subtext0"
      >
        <p class="text-base font-medium text-ctp-text">No resources here</p>
        <p class="mx-auto mt-2 max-w-sm text-sm">
          Packages, trips, bills, and other trackable items from your inbox show up here as they
          arrive.
        </p>
      </div>

      <ResourcePanel
        v-else
        :resources="resourcesStore.items"
        show-thread-link
        @toggle-status="handleToggle"
      />
    </main>
  </div>
</template>

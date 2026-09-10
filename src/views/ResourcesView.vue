<script setup lang="ts">
import { computed } from 'vue'
import { useAllResourcesQuery, useSetResourceStatus } from '@/composables/useResourceQueries'
import ResourcePanel from '@/components/ResourcePanel.vue'
import { dayKey } from '@/lib/resourceDate'
import type { ResourceStatus } from '@/types/server'

const { query, resources } = useAllResourcesQuery()
const setStatus = useSetResourceStatus()

// Show all future resources + anything from the past 7 days (active or completed)
const visibleResources = computed(() => {
  const now = new Date()
  const sevenDaysAgo = new Date(now)
  sevenDaysAgo.setDate(now.getDate() - 7)
  const cutoff = dayKey(sevenDaysAgo)
  return resources.value.filter((r) => dayKey(r.displayDate ?? r.expectedResolutionDate) >= cutoff)
})

const activeResources = computed(() => visibleResources.value.filter((r) => r.status !== 'complete'))
const completedResources = computed(() => visibleResources.value.filter((r) => r.status === 'complete'))

function handleToggle(resourceId: string, newStatus: ResourceStatus) {
  setStatus.mutate({ resourceId, status: newStatus })
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
        v-if="query.error.value"
        class="mb-4 rounded-lg border border-ctp-red bg-ctp-red/10 px-4 py-3 text-sm text-ctp-red"
      >
        {{ query.error.value?.message }}
      </div>

      <div
        v-if="!query.isLoading.value && visibleResources.length === 0"
        class="py-20 text-center text-ctp-subtext0"
      >
        <p class="text-base font-medium text-ctp-text">No resources here</p>
        <p class="mx-auto mt-2 max-w-sm text-sm">
          Packages, trips, bills, and other trackable items from your inbox show up here as they
          arrive.
        </p>
      </div>

      <template v-else>
        <ResourcePanel
          :resources="activeResources"
          show-thread-link
          @toggle-status="handleToggle"
        />

        <div v-if="completedResources.length > 0" class="mt-6">
          <h2 class="px-1 text-xs font-semibold uppercase tracking-wide text-ctp-subtext0">
            Completed
          </h2>
          <div class="mt-2">
            <ResourcePanel
              :resources="completedResources"
              show-thread-link
              @toggle-status="handleToggle"
            />
          </div>
        </div>
      </template>
    </main>
  </div>
</template>

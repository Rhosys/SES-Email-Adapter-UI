<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { useResourcesStore } from '@/stores/resources'
import WorkflowIcon from '@/components/WorkflowIcon.vue'
import ResourceAssetCard from '@/components/ResourceAssetCard.vue'
import { formatResourceDate, isResourceDatePast } from '@/lib/resourceDate'
import type { Resource, ResourceStatus, ResourceWorkflow } from '@/types/server'

const resourcesStore = useResourcesStore()
const statusFilter = ref<'active' | 'complete' | 'all'>('active')

onMounted(() => {
  void resourcesStore.fetchAllResources()
})

const workflowLabel: Record<ResourceWorkflow, string> = {
  package: 'Package',
  travel: 'Travel',
  payments: 'Payment',
  healthcare: 'Healthcare',
  job: 'Job',
  events: 'Event',
}

const statusTabs: { value: 'active' | 'complete' | 'all'; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'complete', label: 'Complete' },
  { value: 'all', label: 'All' },
]

const filteredResources = computed(() => {
  const sorted = [...resourcesStore.items].sort((a, b) => a.expectedResolutionDate.localeCompare(b.expectedResolutionDate))
  if (statusFilter.value === 'all') return sorted
  return sorted.filter((r) => r.status === statusFilter.value)
})

function toggleStatus(resource: Resource) {
  const next: ResourceStatus = resource.status === 'active' ? 'complete' : 'active'
  void resourcesStore.setResourceStatus(resource.resourceId, next)
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

    <div class="flex gap-1 border-b border-ctp-surface0 px-4 py-2">
      <button
        v-for="tab in statusTabs"
        :key="tab.value"
        type="button"
        class="rounded-full px-3 py-1 text-xs font-medium transition-colors"
        :class="
          statusFilter === tab.value
            ? 'bg-ctp-mauve text-ctp-base'
            : 'text-ctp-subtext1 hover:bg-ctp-surface0'
        "
        @click="statusFilter = tab.value"
      >
        {{ tab.label }}
      </button>
    </div>

    <main class="mx-auto max-w-3xl px-4 py-4">
      <div
        v-if="resourcesStore.error"
        class="mb-4 rounded-lg border border-ctp-red bg-ctp-red/10 px-4 py-3 text-sm text-ctp-red"
      >
        {{ resourcesStore.error }}
      </div>

      <div
        v-if="!resourcesStore.loading && filteredResources.length === 0"
        class="py-20 text-center text-ctp-subtext0"
      >
        <p class="text-base font-medium text-ctp-text">No resources here</p>
        <p class="mx-auto mt-2 max-w-sm text-sm">
          Packages, trips, bills, and other trackable items from your inbox show up here as they
          arrive.
        </p>
      </div>

      <div v-else class="space-y-2" role="list" aria-label="Resources">
        <div
          v-for="resource in filteredResources"
          :key="resource.resourceId"
          role="listitem"
          class="flex items-start gap-3 rounded-md border border-ctp-surface0 bg-ctp-base p-3 transition-colors hover:border-ctp-surface1"
        >
          <WorkflowIcon :workflow="resource.workflow" class="mt-0.5 shrink-0" />
          <div class="min-w-0 flex-1">
            <div class="flex items-center justify-between gap-2">
              <span class="text-sm font-medium text-ctp-text">
                {{ workflowLabel[resource.workflow] || resource.workflow }}
              </span>
              <span
                class="shrink-0 text-xs"
                :class="
                  resource.status === 'active' && isResourceDatePast(resource.expectedResolutionDate)
                    ? 'font-medium text-ctp-red'
                    : 'text-ctp-subtext0'
                "
              >
                {{ formatResourceDate(resource.expectedResolutionDate) }}
              </span>
            </div>

            <div v-if="resource.assets.length > 0" class="mt-2 space-y-1.5">
              <ResourceAssetCard v-for="(asset, idx) in resource.assets" :key="idx" :asset="asset" />
            </div>

            <div class="mt-2 flex items-center gap-2">
              <RouterLink
                :to="{ name: 'thread-detail', params: { id: resource.threadId } }"
                class="flex items-center gap-1.5 rounded-lg border border-ctp-surface1 px-3 py-1.5 text-xs text-ctp-subtext1 no-underline hover:border-ctp-mauve hover:text-ctp-mauve"
              >
                Jump to thread
                <svg class="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                  <path d="M6 3.5L10.5 8 6 12.5l-1-1L8.5 8 5 4.5l1-1z" />
                </svg>
              </RouterLink>
              <button
                type="button"
                class="rounded-lg border border-ctp-surface1 px-3 py-1.5 text-xs text-ctp-subtext1 hover:border-ctp-surface2 hover:text-ctp-text"
                @click="toggleStatus(resource)"
              >
                {{ resource.status === 'active' ? 'Mark complete' : 'Mark active' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

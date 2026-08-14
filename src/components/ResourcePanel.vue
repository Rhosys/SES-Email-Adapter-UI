<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import WorkflowIcon from '@/components/WorkflowIcon.vue'
import ResourceAssetCard from '@/components/ResourceAssetCard.vue'
import { formatResourceDate, isResourceDatePast } from '@/lib/resourceDate'
import type { Resource, ResourceStatus, ResourceWorkflow } from '@/types/server'

const props = defineProps<{
  resources: Resource[]
  showThreadLink?: boolean
}>()

const emit = defineEmits<{
  toggleStatus: [resourceId: string, newStatus: ResourceStatus]
}>()

const workflowLabel: Record<ResourceWorkflow, string> = {
  package: 'Package',
  travel: 'Travel',
  payments: 'Payment',
  healthcare: 'Healthcare',
  job: 'Job',
  events: 'Event',
}

const sortedResources = computed(() =>
  [...props.resources].sort((a, b) => {
    if (a.status === 'active' && b.status !== 'active') return -1
    if (a.status !== 'active' && b.status === 'active') return 1
    return a.expectedResolutionDate.localeCompare(b.expectedResolutionDate)
  }),
)

function handleToggle(resource: Resource) {
  const next: ResourceStatus = resource.status === 'active' ? 'complete' : 'active'
  emit('toggleStatus', resource.resourceId, next)
}
</script>

<template>
  <div v-if="sortedResources.length > 0" class="space-y-2" role="list" aria-label="Resources">
    <div
      v-for="resource in sortedResources"
      :key="resource.resourceId"
      role="listitem"
      class="group flex items-start gap-3 rounded-md border border-ctp-surface0 bg-ctp-base p-3 transition-colors hover:border-ctp-surface1"
    >
      <WorkflowIcon :workflow="resource.workflow" class="mt-0.5 shrink-0" />
      <div class="min-w-0 flex-1">
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <span class="text-sm font-medium text-ctp-text">
              {{ workflowLabel[resource.workflow] || resource.workflow }}
            </span>
            <span
              v-if="resource.status === 'complete'"
              class="inline-block rounded-full bg-ctp-green/15 px-2 py-0.5 text-[10px] font-medium text-ctp-green"
            >
              Completed
            </span>
          </div>
          <span
            class="shrink-0 text-xs"
            :class="
              resource.status === 'active' && isResourceDatePast(resource.displayDate ?? resource.expectedResolutionDate)
                ? 'font-medium text-ctp-red'
                : 'text-ctp-subtext0'
            "
          >
            {{ formatResourceDate(resource.displayDate ?? resource.expectedResolutionDate) }}
          </span>
        </div>

        <div v-if="resource.assets.length > 0" class="mt-2 space-y-1.5">
          <ResourceAssetCard v-for="(asset, idx) in resource.assets" :key="idx" :asset="asset" />
        </div>

        <div class="mt-2 flex items-center justify-end gap-2">
          <RouterLink
            v-if="showThreadLink"
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
            @click="handleToggle(resource)"
          >
            {{ resource.status === 'active' ? 'Mark complete' : 'Mark active' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { useResourcesStore } from '@/stores/resources'
import WorkflowIcon from '@/components/WorkflowIcon.vue'
import ResourceAssetCard from '@/components/ResourceAssetCard.vue'
import { formatResourceDate } from '@/lib/resourceDate'
import type { Resource, ResourceWorkflow } from '@/types/server'

const resourcesStore = useResourcesStore()
const expanded = ref(true)

onMounted(() => {
  void resourcesStore.fetchResources()
})

const workflowLabel: Record<ResourceWorkflow, string> = {
  package: 'Packages',
  travel: 'Travel',
  payments: 'Payments',
  healthcare: 'Healthcare',
  job: 'Jobs',
  events: 'Events',
}

function handleDismiss(resource: Resource) {
  void resourcesStore.dismissResource(resource.resourceId)
}

function handleComplete(resource: Resource) {
  void resourcesStore.completeResource(resource.resourceId)
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
        Resources
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

    <div v-if="expanded" class="space-y-3 px-3 pb-3">
      <!-- Today section -->
      <div v-if="resourcesStore.today.length > 0">
        <h3 class="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ctp-red">
          Today
        </h3>
        <div class="space-y-1.5">
          <div
            v-for="resource in resourcesStore.today"
            :key="resource.resourceId"
            class="group rounded-md border border-ctp-surface0 bg-ctp-base p-2.5 transition-colors hover:border-ctp-surface1"
          >
            <div class="flex items-start gap-2">
              <WorkflowIcon :workflow="resource.workflow as any" class="mt-0.5 shrink-0" />
              <div class="min-w-0 flex-1">
                <div class="flex items-center justify-between">
                  <RouterLink
                    :to="{ name: 'thread-detail', params: { id: resource.threadId } }"
                    class="text-sm font-medium text-ctp-text no-underline hover:underline"
                  >
                    {{ workflowLabel[resource.workflow] || resource.workflow }}
                  </RouterLink>
                  <span class="text-[10px] text-ctp-subtext0">{{ formatResourceDate(resource.expectedResolutionDate) }}</span>
                </div>
                <!-- Assets -->
                <div v-if="resource.assets.length > 0" class="mt-2 space-y-1.5">
                  <ResourceAssetCard
                    v-for="(asset, idx) in resource.assets"
                    :key="idx"
                    :asset="asset"
                  />
                </div>
              </div>
              <!-- Actions -->
              <div class="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                <RouterLink
                  :to="{ name: 'thread-detail', params: { id: resource.threadId } }"
                  class="rounded p-1 text-ctp-subtext0 hover:bg-ctp-surface0 hover:text-ctp-mauve"
                  title="Jump to thread"
                  @click.stop
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M6 3.5L10.5 8 6 12.5l-1-1L8.5 8 5 4.5l1-1z" /></svg>
                </RouterLink>
                <button
                  type="button"
                  class="rounded p-1 text-ctp-subtext0 hover:bg-ctp-surface0 hover:text-ctp-green"
                  title="Mark complete"
                  @click.stop="handleComplete(resource)"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                </button>
                <button
                  type="button"
                  class="rounded p-1 text-ctp-subtext0 hover:bg-ctp-surface0 hover:text-ctp-overlay0"
                  title="Dismiss"
                  @click.stop="handleDismiss(resource)"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- This week section -->
      <div v-if="resourcesStore.thisWeek.length > 0">
        <h3 class="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ctp-yellow">
          This week
        </h3>
        <div class="space-y-1.5">
          <div
            v-for="resource in resourcesStore.thisWeek"
            :key="resource.resourceId"
            class="group rounded-md border border-ctp-surface0 bg-ctp-base p-2.5 transition-colors hover:border-ctp-surface1"
          >
            <div class="flex items-start gap-2">
              <WorkflowIcon :workflow="resource.workflow as any" class="mt-0.5 shrink-0" />
              <div class="min-w-0 flex-1">
                <div class="flex items-center justify-between">
                  <RouterLink
                    :to="{ name: 'thread-detail', params: { id: resource.threadId } }"
                    class="text-sm font-medium text-ctp-text no-underline hover:underline"
                  >
                    {{ workflowLabel[resource.workflow] || resource.workflow }}
                  </RouterLink>
                  <span class="text-[10px] text-ctp-subtext0">{{ formatResourceDate(resource.expectedResolutionDate) }}</span>
                </div>
                <div v-if="resource.assets.length > 0" class="mt-2 space-y-1.5">
                  <ResourceAssetCard
                    v-for="(asset, idx) in resource.assets"
                    :key="idx"
                    :asset="asset"
                  />
                </div>
              </div>
              <div class="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                <RouterLink
                  :to="{ name: 'thread-detail', params: { id: resource.threadId } }"
                  class="rounded p-1 text-ctp-subtext0 hover:bg-ctp-surface0 hover:text-ctp-mauve"
                  title="Jump to thread"
                  @click.stop
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M6 3.5L10.5 8 6 12.5l-1-1L8.5 8 5 4.5l1-1z" /></svg>
                </RouterLink>
                <button
                  type="button"
                  class="rounded p-1 text-ctp-subtext0 hover:bg-ctp-surface0 hover:text-ctp-green"
                  title="Mark complete"
                  @click.stop="handleComplete(resource)"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                </button>
                <button
                  type="button"
                  class="rounded p-1 text-ctp-subtext0 hover:bg-ctp-surface0 hover:text-ctp-overlay0"
                  title="Dismiss"
                  @click.stop="handleDismiss(resource)"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Upcoming section -->
      <div v-if="resourcesStore.upcoming.length > 0">
        <h3 class="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ctp-subtext0">
          Upcoming
        </h3>
        <div class="space-y-1.5">
          <div
            v-for="resource in resourcesStore.upcoming"
            :key="resource.resourceId"
            class="group rounded-md border border-ctp-surface0 bg-ctp-base p-2.5 transition-colors hover:border-ctp-surface1"
          >
            <div class="flex items-start gap-2">
              <WorkflowIcon :workflow="resource.workflow as any" class="mt-0.5 shrink-0" />
              <div class="min-w-0 flex-1">
                <div class="flex items-center justify-between">
                  <RouterLink
                    :to="{ name: 'thread-detail', params: { id: resource.threadId } }"
                    class="text-sm font-medium text-ctp-text no-underline hover:underline"
                  >
                    {{ workflowLabel[resource.workflow] || resource.workflow }}
                  </RouterLink>
                  <span class="text-[10px] text-ctp-subtext0">{{ formatResourceDate(resource.expectedResolutionDate) }}</span>
                </div>
                <div v-if="resource.assets.length > 0" class="mt-2 space-y-1.5">
                  <ResourceAssetCard
                    v-for="(asset, idx) in resource.assets"
                    :key="idx"
                    :asset="asset"
                  />
                </div>
              </div>
              <div class="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                <RouterLink
                  :to="{ name: 'thread-detail', params: { id: resource.threadId } }"
                  class="rounded p-1 text-ctp-subtext0 hover:bg-ctp-surface0 hover:text-ctp-mauve"
                  title="Jump to thread"
                  @click.stop
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M6 3.5L10.5 8 6 12.5l-1-1L8.5 8 5 4.5l1-1z" /></svg>
                </RouterLink>
                <button
                  type="button"
                  class="rounded p-1 text-ctp-subtext0 hover:bg-ctp-surface0 hover:text-ctp-green"
                  title="Mark complete"
                  @click.stop="handleComplete(resource)"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                </button>
                <button
                  type="button"
                  class="rounded p-1 text-ctp-subtext0 hover:bg-ctp-surface0 hover:text-ctp-overlay0"
                  title="Dismiss"
                  @click.stop="handleDismiss(resource)"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Per-workflow grouped view (collapsed, shown when "Upcoming" has items) -->
      <div v-if="Object.keys(resourcesStore.byWorkflow).length > 1" class="border-t border-ctp-surface0 pt-2">
        <h3 class="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ctp-subtext0">
          By category
        </h3>
        <div class="flex flex-wrap gap-2">
          <div
            v-for="(resources, workflow) in resourcesStore.byWorkflow"
            :key="workflow"
            class="flex items-center gap-1.5 rounded-md bg-ctp-surface0/50 px-2 py-1"
          >
            <WorkflowIcon :workflow="workflow as any" class="!h-4 !w-4" />
            <span class="text-xs text-ctp-text">{{ workflowLabel[workflow as ResourceWorkflow] || workflow }}</span>
            <span class="rounded-full bg-ctp-surface1 px-1.5 text-[10px] text-ctp-subtext0">{{ resources!.length }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

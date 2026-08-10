<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { api } from '@/lib/api'
import { useAccountStore } from '@/stores/account'
import WorkflowIcon from '@/components/WorkflowIcon.vue'
import ResourceAssetCard from '@/components/ResourceAssetCard.vue'
import type { Resource, ResourceStatus, ResourceWorkflow } from '@/types/server'

const props = defineProps<{ threadId: string }>()

const accountStore = useAccountStore()
const resources = ref<Resource[]>([])
const loading = ref(false)

const activeResources = computed(() => resources.value.filter(r => r.status === 'active'))
const completedResources = computed(() => resources.value.filter(r => r.status === 'complete'))

const workflowLabel: Record<ResourceWorkflow, string> = {
  package: 'Package',
  travel: 'Travel',
  payments: 'Payment',
  healthcare: 'Healthcare',
  job: 'Job',
  events: 'Event',
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00')
  const now = new Date()
  const todayStr = now.toISOString().slice(0, 10)
  if (dateStr === todayStr) return 'Today'
  const tomorrow = new Date(now)
  tomorrow.setDate(now.getDate() + 1)
  if (dateStr === tomorrow.toISOString().slice(0, 10)) return 'Tomorrow'
  const diff = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  if (diff > 0 && diff <= 7) return `In ${diff} day${diff === 1 ? '' : 's'}`
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

function isPast(dateStr: string): boolean {
  return dateStr < new Date().toISOString().slice(0, 10)
}

async function fetchResources() {
  const accountId = accountStore.accountId
  if (!accountId) return
  loading.value = true
  const result = await api.listResourcesByThread(accountId, props.threadId)
  loading.value = false
  if (result.isOk()) {
    resources.value = result.value.resources
  }
}

async function completeResource(resourceId: string) {
  const accountId = accountStore.accountId
  if (!accountId) return
  resources.value = resources.value.map(r =>
    r.resourceId === resourceId ? { ...r, status: 'complete' as ResourceStatus } : r,
  )
  const result = await api.patchResource(accountId, resourceId, { status: 'complete' })
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
    <h2 class="mb-3 text-xs font-semibold uppercase tracking-wide text-ctp-subtext0">Resources</h2>

    <!-- Active resources -->
    <div v-if="activeResources.length > 0" class="space-y-2">
      <div
        v-for="resource in activeResources"
        :key="resource.resourceId"
        class="group flex items-start gap-3 rounded-md border border-ctp-surface0 bg-ctp-base p-3 transition-colors hover:border-ctp-surface1"
      >
        <WorkflowIcon :workflow="resource.workflow as any" class="mt-0.5 shrink-0" />
        <div class="min-w-0 flex-1">
          <div class="flex items-center justify-between">
            <span class="text-sm font-medium text-ctp-text">
              {{ workflowLabel[resource.workflow] || resource.workflow }}
            </span>
            <span
              class="text-xs"
              :class="isPast(resource.expectedResolutionDate) ? 'font-medium text-ctp-red' : 'text-ctp-subtext0'"
            >
              {{ formatDate(resource.expectedResolutionDate) }}
            </span>
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
        <!-- Complete action -->
        <button
          type="button"
          class="shrink-0 rounded p-1 text-ctp-subtext0 opacity-0 transition-opacity hover:bg-ctp-surface0 hover:text-ctp-green group-hover:opacity-100"
          title="Mark complete"
          @click.stop="completeResource(resource.resourceId)"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
        </button>
      </div>
    </div>

    <!-- Completed resources (collapsed summary) -->
    <div v-if="completedResources.length > 0" class="mt-3 border-t border-ctp-surface0 pt-3">
      <div class="flex items-center gap-2 text-xs text-ctp-subtext0">
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
        <span>{{ completedResources.length }} completed</span>
      </div>
    </div>
  </div>
</template>

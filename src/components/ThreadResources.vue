<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { api } from '@/lib/api'
import { useAccountStore } from '@/stores/account'
import { isAdminUser } from '@/stores/admin'
import WorkflowIcon from '@/components/WorkflowIcon.vue'
import ResourceAssetCard from '@/components/ResourceAssetCard.vue'
import OverflowMenu from '@/components/ui/OverflowMenu.vue'
import { formatResourceDate, isResourceDatePast } from '@/lib/resourceDate'
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

const viewingResource = ref<Resource | null>(null)
const resourceObjectJson = computed(() => (viewingResource.value ? JSON.stringify(viewingResource.value, null, 2) : ''))
const resourceObjectCopied = ref(false)

function showResourceObject(resource: Resource) {
  viewingResource.value = resource
}

function copyResourceObject() {
  if (!resourceObjectJson.value) return
  void navigator.clipboard.writeText(resourceObjectJson.value).then(() => {
    resourceObjectCopied.value = true
    setTimeout(() => { resourceObjectCopied.value = false }, 1500)
  })
}
</script>

<template>
  <div v-if="resources.length > 0" class="mb-6 rounded-lg border border-ctp-surface0 bg-ctp-mantle p-4">
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
              :class="isResourceDatePast(resource.expectedResolutionDate) ? 'font-medium text-ctp-red' : 'text-ctp-subtext0'"
            >
              {{ formatResourceDate(resource.expectedResolutionDate) }}
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
        <!-- Admin overflow menu -->
        <OverflowMenu
          v-if="isAdminUser()"
          class="shrink-0"
          label="Resource actions"
          sheet-title="Resource actions"
          trigger-class="flex h-8 w-8 items-center justify-center rounded text-ctp-subtext0 opacity-0 transition-opacity hover:bg-ctp-surface0 hover:text-ctp-text group-hover:opacity-100"
        >
          <button
            class="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-ctp-subtext1 hover:bg-ctp-surface0 hover:text-ctp-text"
            role="menuitem"
            @click="showResourceObject(resource)"
          >
            Show resource
          </button>
        </OverflowMenu>
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

  <!-- Resource object modal -->
  <Teleport to="body">
    <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions,vuejs-accessibility/click-events-have-key-events -->
    <div v-if="viewingResource" class="fixed inset-0 z-[200] flex items-center justify-center bg-ctp-base/80" @click.self="viewingResource = null">
      <div class="relative max-h-[80vh] w-full max-w-2xl overflow-auto rounded-xl border border-ctp-surface1 bg-ctp-mantle p-4 shadow-2xl">
        <div class="mb-3 flex items-center justify-between">
          <h3 class="text-sm font-semibold text-ctp-text">Resource object</h3>
          <div class="flex items-center gap-3">
            <button class="text-xs text-ctp-subtext0 hover:text-ctp-mauve" @click="copyResourceObject">{{ resourceObjectCopied ? '✓ Copied' : 'Copy' }}</button>
            <button class="text-xs text-ctp-subtext0 hover:text-ctp-text" @click="viewingResource = null">Close</button>
          </div>
        </div>
        <pre class="overflow-auto rounded-lg bg-ctp-base p-3 font-mono text-xs text-ctp-text break-all whitespace-pre-wrap">{{ resourceObjectJson }}</pre>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import type { Arc } from '@/types/server'
import { useAccountStore } from '@/stores/account'
import { useArcsStore } from '@/stores/arcs'
import { api } from '@/lib/api'
import ArcRowContent from './ArcRowContent.vue'

const props = defineProps<{ arc: Arc; selected: boolean; focused?: boolean }>()
const emit = defineEmits<{ 'toggle-select': [id: string] }>()

const accountStore = useAccountStore()
const arcsStore = useArcsStore()

async function unarchiveArc() {
  const id = accountStore.accountId
  if (!id) return
  const result = await api.patchArc(id, props.arc.arcId, { status: 'active' })
  if (result.isOk()) {
    arcsStore.removeArc(props.arc.arcId)
    void arcsStore.refreshArc(props.arc.arcId)
  }
}
</script>

<template>
  <div class="arc-row" :data-arc-id="arc.arcId">
    <div
      class="group relative flex items-center gap-2 border-b border-ctp-surface0 px-3 py-2.5 transition-colors hover:bg-ctp-surface0"
      :class="[focused && 'ring-1 ring-inset ring-ctp-mauve']"
      role="row"
    >
      <!-- Checkbox -->
      <div class="shrink-0 opacity-0 transition-opacity group-hover:opacity-100" :class="{ 'opacity-100': selected }">
        <input
          type="checkbox"
          :checked="selected"
          class="h-4 w-4 rounded border-ctp-overlay0 bg-ctp-surface1 accent-ctp-blue"
          :aria-label="`Select thread: ${arc.summary}`"
          @change="emit('toggle-select', arc.arcId)"
        />
      </div>

      <ArcRowContent :arc="arc" />

      <!-- Unarchive action -->
      <div class="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          class="flex h-7 items-center gap-1 rounded border border-ctp-surface1 px-2 text-xs text-ctp-subtext1 hover:border-ctp-green hover:text-ctp-green"
          title="Move to Inbox"
          @click.prevent="unarchiveArc"
        >
          <svg class="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M2 8h12M8 2v12M5 5l3-3 3 3"/>
          </svg>
        </button>
      </div>
    </div>
  </div>
</template>

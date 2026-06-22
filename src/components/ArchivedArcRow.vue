<script setup lang="ts">
import type { Arc } from '@/types/server'
import { useArcsStore } from '@/stores/arcs'
import ArcRowContent from './ArcRowContent.vue'

const props = defineProps<{ arc: Arc; selected: boolean; focused?: boolean }>()
const emit = defineEmits<{ 'toggle-select': [id: string] }>()

const arcsStore = useArcsStore()

async function unarchiveArc() {
  await arcsStore.moveToInbox(props.arc.arcId)
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
          <svg class="h-3.5 w-3.5 rotate-180" viewBox="0 0 512 512" fill="currentColor" aria-hidden="true">
            <path d="M352 96l64 0c17.7 0 32 14.3 32 32l0 256c0 17.7-14.3 32-32 32l-64 0c-17.7 0-32 14.3-32 32s14.3 32 32 32l64 0c53 0 96-43 96-96l0-256c0-53-43-96-96-96l-64 0c-17.7 0-32 14.3-32 32s14.3 32 32 32zm-9.4 182.6c12.5-12.5 12.5-32.8 0-45.3l-128-128c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L242.7 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l210.7 0-73.4 73.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l128-128z"/>
          </svg>
          Inbox
        </button>
      </div>
    </div>
  </div>
</template>

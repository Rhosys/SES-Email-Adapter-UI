<script setup lang="ts">
import type { Arc } from '@/types/server'
import ArcRowContent from './ArcRowContent.vue'
import StatusBadge from './StatusBadge.vue'

defineProps<{ arc: Arc; selected: boolean; focused?: boolean }>()
const emit = defineEmits<{ 'toggle-select': [id: string] }>()
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

      <!-- Status badge instead of actions -->
      <StatusBadge :status="arc.status" />
    </div>
  </div>
</template>

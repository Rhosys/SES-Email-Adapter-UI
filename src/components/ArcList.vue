<script setup lang="ts">
import type { Arc } from '@/types/server'
import ArcRow from './ArcRow.vue'

defineProps<{
  arcs: Arc[]
  selectedIds: Set<string>
  allSelected: boolean
  focusedArcId?: string | null
}>()

const emit = defineEmits<{
  (e: 'toggle-select', id: string): void
  (e: 'select-all'): void
  (e: 'clear-selection'): void
}>()

function handleSelectAll(event: Event) {
  const checkbox = event.target as HTMLInputElement
  if (checkbox.checked) {
    emit('select-all')
  } else {
    emit('clear-selection')
  }
}
</script>

<template>
  <div role="table" aria-label="Arc list">
    <!-- Header row with select-all -->
    <div class="flex items-center border-b border-ctp-surface0 px-3 py-2" role="row">
      <div class="ml-2 shrink-0">
        <input
          type="checkbox"
          :checked="allSelected"
          class="h-4 w-4 rounded border-ctp-overlay0 bg-ctp-surface1 accent-ctp-blue"
          aria-label="Select all arcs"
          @change="handleSelectAll"
        />
      </div>
    </div>

    <!-- Arc rows -->
    <TransitionGroup name="list" tag="div" class="relative">
      <ArcRow
        v-for="arc in arcs"
        :key="arc.arcId"
        :arc="arc"
        :selected="selectedIds.has(arc.arcId)"
        :focused="arc.arcId === focusedArcId"
        @toggle-select="emit('toggle-select', $event)"
      />
    </TransitionGroup>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  allSelected: boolean
}>()

const emit = defineEmits<{
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
          aria-label="Select all threads"
          @change="handleSelectAll"
        />
      </div>
    </div>

    <!-- Rows injected via slot -->
    <TransitionGroup name="list" tag="div" class="relative">
      <slot />
    </TransitionGroup>
  </div>
</template>

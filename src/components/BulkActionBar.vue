<script setup lang="ts">
import { ref } from 'vue'

defineProps<{ count: number; pending: boolean }>()
const emit = defineEmits<{
  (e: 'archive'): void
  (e: 'label', label: string): void
  (e: 'clear'): void
}>()

const labelInput = ref('')

function submitLabel() {
  const val = labelInput.value.trim()
  if (!val) return
  emit('label', val)
  labelInput.value = ''
}
</script>

<template>
  <div
    class="mb-2 flex flex-wrap items-center gap-3 rounded border border-ctp-surface1 bg-ctp-mantle px-3 py-2 text-sm"
  >
    <span class="text-ctp-subtext1">{{ count }} selected</span>

    <button
      :disabled="pending"
      class="rounded bg-ctp-surface0 px-3 py-1 text-ctp-text hover:bg-ctp-surface1 disabled:opacity-50"
      @click="emit('archive')"
    >
      Archive
    </button>

    <form class="flex items-center gap-1" @submit.prevent="submitLabel">
      <input
        v-model="labelInput"
        type="text"
        placeholder="Add label…"
        class="rounded border border-ctp-surface1 bg-ctp-surface0 px-2 py-1 text-sm text-ctp-text placeholder-ctp-overlay0 focus:outline-none focus:ring-1 focus:ring-ctp-blue"
      />
      <button
        type="submit"
        :disabled="pending || !labelInput.trim()"
        class="rounded bg-ctp-surface0 px-2 py-1 text-ctp-subtext0 hover:bg-ctp-surface1 disabled:opacity-50"
      >
        Add
      </button>
    </form>

    <button class="ml-auto text-ctp-subtext0 hover:text-ctp-text" @click="emit('clear')">
      Clear
    </button>
  </div>
</template>

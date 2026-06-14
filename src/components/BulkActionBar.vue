<script setup lang="ts">
import { ref, computed } from 'vue'
import AsyncButton from '@/components/ui/AsyncButton.vue'

const props = defineProps<{ count: number; pending: boolean; archiveAction: () => Promise<unknown>; labelAction: (label: string) => Promise<unknown> }>()
const emit = defineEmits<{
  (e: 'clear'): void
}>()

const isEmpty = computed(() => props.count === 0)

const labelInput = ref('')

function labelActionWrapper(action: (label: string) => Promise<unknown>) {
  return async () => {
    const val = labelInput.value.trim()
    if (!val) return
    await action(val)
    labelInput.value = ''
  }
}
</script>

<template>
  <div
    class="mb-2 flex flex-wrap items-center gap-3 rounded border border-ctp-surface1 bg-ctp-mantle px-3 py-2 text-sm transition-opacity"
    :class="{ 'pointer-events-none opacity-50': isEmpty }"
  >
    <span class="text-ctp-subtext1">{{ count || 0 }} selected</span>

    <AsyncButton
      :action="archiveAction"
      :disabled="pending"
      variant="ghost"
      class="rounded bg-ctp-surface0 px-3 py-1.5 text-ctp-text hover:bg-ctp-surface1"
    >
      Archive
    </AsyncButton>

    <form class="flex flex-wrap items-center gap-1" @submit.prevent="labelActionWrapper(labelAction)()">
      <input
        v-model="labelInput"
        type="text"
        aria-label="Label name"
        placeholder="Add label…"
        class="w-full rounded border border-ctp-surface1 bg-ctp-surface0 px-2 py-1.5 text-sm text-ctp-text placeholder-ctp-overlay0 focus:outline-none focus:ring-1 focus:ring-ctp-blue sm:w-auto"
      />
      <AsyncButton
        :action="labelActionWrapper(labelAction)"
        :disabled="pending || !labelInput.trim()"
        type="submit"
        variant="ghost"
        class="rounded bg-ctp-surface0 px-2 py-1.5 text-ctp-subtext0 hover:bg-ctp-surface1"
      >
        Add
      </AsyncButton>
    </form>

    <button class="ml-auto text-ctp-subtext0 hover:text-ctp-text" @click="emit('clear')">
      Clear
    </button>
  </div>
</template>

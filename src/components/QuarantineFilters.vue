<script setup lang="ts">
import { ref, watch } from 'vue'
import type { QuarantineFilters } from '@/stores/quarantine'

const props = defineProps<{ filters: QuarantineFilters }>()
const emit = defineEmits<{ (e: 'update', filters: Partial<QuarantineFilters>): void }>()

const sender = ref(props.filters.sender)
const after = ref(props.filters.after)
const before = ref(props.filters.before)

const hasFilters = ref(false)

watch([sender, after, before], () => {
  hasFilters.value = !!(sender.value || after.value || before.value)
  emit('update', {
    sender: sender.value,
    after: after.value,
    before: before.value,
  })
})

function reset() {
  sender.value = ''
  after.value = ''
  before.value = ''
}
</script>

<template>
  <div class="flex flex-wrap items-end gap-3 border-b border-ctp-surface0 bg-ctp-mantle px-4 py-3">
    <!-- Sender filter -->
    <div class="flex min-w-0 flex-1 flex-col gap-1 sm:flex-none">
      <label for="qf-sender" class="text-xs text-ctp-subtext0">Sender</label>
      <input
        id="qf-sender"
        v-model="sender"
        type="text"
        placeholder="sender@example.com"
        class="w-full rounded border border-ctp-surface1 bg-ctp-surface0 px-2 py-1.5 text-sm text-ctp-text placeholder-ctp-overlay0 focus:border-ctp-blue focus:outline-none sm:w-48"
      />
    </div>

    <!-- Date range -->
    <div class="flex flex-col gap-1">
      <label for="qf-after" class="text-xs text-ctp-subtext0">After</label>
      <input
        id="qf-after"
        v-model="after"
        type="date"
        class="rounded border border-ctp-surface1 bg-ctp-surface0 px-2 py-1.5 text-sm text-ctp-text focus:border-ctp-blue focus:outline-none"
      />
    </div>

    <div class="flex flex-col gap-1">
      <label for="qf-before" class="text-xs text-ctp-subtext0">Before</label>
      <input
        id="qf-before"
        v-model="before"
        type="date"
        class="rounded border border-ctp-surface1 bg-ctp-surface0 px-2 py-1.5 text-sm text-ctp-text focus:border-ctp-blue focus:outline-none"
      />
    </div>

    <!-- Clear -->
    <button
      v-if="hasFilters"
      class="min-h-[36px] rounded border border-ctp-surface1 px-3 py-1.5 text-sm text-ctp-subtext0 transition-colors hover:text-ctp-text"
      @click="reset"
    >
      Clear filters
    </button>
  </div>
</template>

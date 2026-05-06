<script setup lang="ts">
import { ref, watch } from 'vue'
import type { BlockReason } from '@/types/server'
import type { QuarantineFilters } from '@/stores/quarantine'

const props = defineProps<{ filters: QuarantineFilters }>()
const emit = defineEmits<{ (e: 'update', filters: Partial<QuarantineFilters>): void }>()

const sender = ref(props.filters.sender)
const blockReason = ref<BlockReason | ''>(props.filters.blockReason)
const after = ref(props.filters.after)
const before = ref(props.filters.before)

const blockReasonOptions: { value: BlockReason | ''; label: string }[] = [
  { value: '', label: 'All reasons' },
  { value: 'new_sender', label: 'New sender' },
  { value: 'spam', label: 'Spam' },
  { value: 'sender_mismatch', label: 'Sender mismatch' },
  { value: 'reputation', label: 'Poor reputation' },
  { value: 'onboarding', label: 'Onboarding hold' },
]

watch([sender, blockReason, after, before], () => {
  emit('update', {
    sender: sender.value,
    blockReason: blockReason.value,
    after: after.value,
    before: before.value,
  })
})

function reset() {
  sender.value = ''
  blockReason.value = ''
  after.value = ''
  before.value = ''
}

const hasFilters = ref(false)
watch([sender, blockReason, after, before], () => {
  hasFilters.value = !!(sender.value || blockReason.value || after.value || before.value)
})
</script>

<template>
  <div class="flex flex-wrap items-end gap-3 border-b border-ctp-surface0 bg-ctp-mantle px-4 py-3">
    <!-- Sender filter -->
    <div class="flex flex-col gap-1">
      <label class="text-xs text-ctp-subtext0">Sender</label>
      <input
        v-model="sender"
        type="text"
        placeholder="sender@example.com"
        class="w-48 rounded border border-ctp-surface1 bg-ctp-surface0 px-2 py-1 text-sm text-ctp-text placeholder-ctp-overlay0 focus:border-ctp-blue focus:outline-none"
      />
    </div>

    <!-- Block reason filter -->
    <div class="flex flex-col gap-1">
      <label class="text-xs text-ctp-subtext0">Reason</label>
      <select
        v-model="blockReason"
        class="rounded border border-ctp-surface1 bg-ctp-surface0 px-2 py-1 text-sm text-ctp-text focus:border-ctp-blue focus:outline-none"
      >
        <option v-for="opt in blockReasonOptions" :key="opt.value" :value="opt.value">
          {{ opt.label }}
        </option>
      </select>
    </div>

    <!-- Date range -->
    <div class="flex flex-col gap-1">
      <label class="text-xs text-ctp-subtext0">After</label>
      <input
        v-model="after"
        type="date"
        class="rounded border border-ctp-surface1 bg-ctp-surface0 px-2 py-1 text-sm text-ctp-text focus:border-ctp-blue focus:outline-none"
      />
    </div>

    <div class="flex flex-col gap-1">
      <label class="text-xs text-ctp-subtext0">Before</label>
      <input
        v-model="before"
        type="date"
        class="rounded border border-ctp-surface1 bg-ctp-surface0 px-2 py-1 text-sm text-ctp-text focus:border-ctp-blue focus:outline-none"
      />
    </div>

    <!-- Clear -->
    <button
      v-if="hasFilters"
      class="rounded border border-ctp-surface1 px-3 py-1 text-sm text-ctp-subtext0 transition-colors hover:text-ctp-text"
      @click="reset"
    >
      Clear filters
    </button>
  </div>
</template>

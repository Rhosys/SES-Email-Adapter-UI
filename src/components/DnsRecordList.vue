<script setup lang="ts">
import type { DnsRecord } from '@/types/server'
import CopyInput from '@/components/CopyInput.vue'
import AsyncButton from '@/components/ui/AsyncButton.vue'

defineProps<{
  records: DnsRecord[]
  rechecked: boolean
  recheckPending: boolean
  showRecheck: boolean
}>()

const emit = defineEmits<{
  recheck: []
}>()

async function handleRecheck() {
  emit('recheck')
}

const STATUS_COLORS: Record<string, string> = {
  verified: 'text-ctp-green',
  failing: 'text-ctp-red',
  pending: 'text-ctp-subtext0',
}
</script>

<template>
  <div class="space-y-3">
    <p class="text-sm font-medium text-ctp-subtext1">
      Add these DNS records to your domain provider:
    </p>

    <div
      v-for="(rec, i) in records"
      :key="i"
      class="rounded-lg border border-ctp-surface1 p-3"
    >
      <div class="mb-2 flex items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <span class="rounded bg-ctp-surface1 px-1.5 py-0.5 font-mono text-xs text-ctp-subtext0">
            {{ rec.type }}
          </span>
          <span class="truncate font-mono text-xs text-ctp-text">{{ rec.name }}</span>
        </div>
        <span
          v-if="rechecked"
          class="shrink-0 text-xs font-medium"
          :class="STATUS_COLORS[rec.status] ?? 'text-ctp-subtext0'"
        >
          {{ rec.status }}
        </span>
      </div>
      <div class="space-y-1">
        <p class="text-xs text-ctp-subtext1">Expected:</p>
        <CopyInput :value="rec.value" mono />
        <template v-if="rechecked && rec.currentValue">
          <p class="mt-1 text-xs" :class="rec.status === 'failing' ? 'text-ctp-red' : 'text-ctp-subtext1'">
            Current{{ rec.status === 'failing' ? ' (invalid)' : '' }}:
          </p>
          <p class="break-all font-mono text-xs text-ctp-subtext0">{{ rec.currentValue }}</p>
        </template>
      </div>
    </div>

    <p v-if="rechecked" class="text-xs text-ctp-subtext0">
      DNS changes can take up to 48 hours to propagate globally. Click
      <strong>Re-check DNS</strong> after adding records to your provider.
    </p>

    <div v-if="showRecheck && records.some((r) => r.status !== 'verified')" class="flex items-center pt-2">
      <AsyncButton
        :action="handleRecheck"
        :disabled="recheckPending"
        variant="outline"
        class="px-3 py-1.5 text-xs text-ctp-subtext0 hover:border-ctp-surface2 hover:text-ctp-text"
      >
        Re-check DNS
      </AsyncButton>
    </div>
  </div>
</template>

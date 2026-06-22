<script setup lang="ts">
import { computed, inject } from 'vue'
import { RouterLink } from 'vue-router'
import type { Signal } from '@/types/server'
import { isInboundEmailSignal } from '@/lib/signal-guards'
import { NOW_KEY } from '@/composables/useRelativeTime'
import { formatRelativeTime } from '@/composables/useFormattedTime'
import StatusBadge from './StatusBadge.vue'

const props = defineProps<{
  signal: Signal
  pending: boolean
}>()

const now = inject(NOW_KEY)

const inboundData = computed(() => isInboundEmailSignal(props.signal) ? props.signal.data : null)

const timestamp = computed(() => {
  const receivedAt = inboundData.value?.receivedAt
  if (!receivedAt || !now) return ''
  return formatRelativeTime(receivedAt, now.value)
})

const matchedRules = computed(() => inboundData.value?.matchedRules ?? [])
const reasonLabel = computed(() => {
  if (matchedRules.value.some((r) => r.ruleId === 'SR-00')) return 'Unknown sender'
  return null
})

const isHidden = computed(() => props.signal.status === 'quarantine_hidden')
const toAddress = computed(() => inboundData.value?.to[0]?.address ?? '')
const fromAddress = computed(() => inboundData.value?.from.address ?? '')
const fromDisplay = computed(() => inboundData.value?.from.name || inboundData.value?.from.address || '')
const subject = computed(() => inboundData.value?.subject ?? '')
</script>

<template>
  <RouterLink
    :to="{ name: 'quarantine-detail', params: { id: signal.signalId } }"
    class="block border-b border-ctp-surface0 transition-colors hover:bg-ctp-surface0"
    :class="{ 'opacity-50': pending, 'bg-ctp-mantle/40': isHidden }"
    role="listitem"
  >
    <div class="flex items-start gap-3 px-4 py-3">
      <!-- Quarantine status badge -->
      <div class="mt-0.5 shrink-0">
        <StatusBadge :status="signal.status" />
        <span
          v-if="reasonLabel"
          class="ml-1 inline-block rounded-full bg-ctp-peach/15 px-2 py-0.5 text-xs text-ctp-peach"
        >
          {{ reasonLabel }}
        </span>
      </div>

      <!-- Content -->
      <div class="min-w-0 flex-1">
        <div class="flex items-center justify-between gap-2">
          <p class="truncate text-sm font-medium text-ctp-text">
            {{ fromDisplay }}
            <span class="font-normal text-ctp-subtext0">&lt;{{ fromAddress }}&gt;</span>
          </p>
          <span class="shrink-0 text-xs text-ctp-subtext0">{{ timestamp }}</span>
        </div>

        <p class="mt-0.5 truncate text-sm text-ctp-subtext1">{{ subject }}</p>

        <p v-if="toAddress" class="mt-1 text-xs text-ctp-subtext0">
          <span class="text-ctp-overlay1">To:</span> <span class="text-ctp-sapphire">{{ toAddress }}</span>
        </p>
      </div>
    </div>
  </RouterLink>
</template>

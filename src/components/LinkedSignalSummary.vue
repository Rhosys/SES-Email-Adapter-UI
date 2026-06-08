<script setup lang="ts">
import { computed } from 'vue'
import type { Signal } from '@/types/server'
import { isInboundEmailSignal, isOutboundEmailSignal, isCalendarEventSignal } from '@/lib/signal-guards'

const props = defineProps<{ signal: Signal; label: string }>()

const summary = computed(() => {
  const s = props.signal
  if (isInboundEmailSignal(s)) {
    const { name, address } = s.data.from
    return {
      line1: name ? `${name} <${address}>` : address,
      line2: new Date(s.data.receivedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }),
    }
  }
  if (isOutboundEmailSignal(s)) {
    const to = s.data.to.map((t) => t.name || t.address).join(', ')
    const time = s.data.sentAt ?? s.data.sendInitiatedAt
    return {
      line1: to ? `To: ${to}` : '(no recipients)',
      line2: new Date(time).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }),
    }
  }
  if (isCalendarEventSignal(s)) {
    return {
      line1: s.data.title,
      line2: new Date(s.data.startTime).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }),
    }
  }
  return null
})
</script>

<template>
  <div v-if="summary" class="mt-3 border-t border-ctp-surface1 pt-3">
    <p class="mb-1 text-xs text-ctp-subtext0">{{ label }}</p>
    <p class="text-xs text-ctp-subtext1">{{ summary.line1 }}</p>
    <p class="text-xs text-ctp-subtext0">{{ summary.line2 }}</p>
  </div>
</template>

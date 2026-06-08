<script setup lang="ts">
import type { DeliverabilitySignal, Signal } from '@/types/server'
import LinkedSignalSummary from '@/components/LinkedSignalSummary.vue'

defineProps<{ signal: DeliverabilitySignal; linkedSignal?: Signal }>()
</script>

<template>
  <div class="rounded-lg border border-ctp-surface1 bg-ctp-mantle p-4">
    <div class="mb-2 flex items-center gap-2">
      <svg class="h-4 w-4 text-ctp-red" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
        <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 10.5a1 1 0 110-2 1 1 0 010 2zM8.75 4v4.5h-1.5V4h1.5z"/>
      </svg>
      <span class="text-sm font-medium text-ctp-text">Delivery Failure</span>
      <span class="ml-auto text-xs text-ctp-subtext0">{{ new Date(signal.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) }}</span>
    </div>

    <p class="mb-2 text-xs text-ctp-subtext0">
      Subject: <span class="text-ctp-subtext1">{{ signal.data.subject }}</span>
    </p>

    <div class="space-y-1">
      <div
        v-for="recipient in signal.data.bouncedRecipients"
        :key="recipient.address"
        class="flex items-center gap-2 text-sm"
      >
        <span
          class="rounded px-1.5 py-0.5 text-xs font-medium"
          :class="recipient.bounceType === 'permanent' ? 'bg-ctp-red/15 text-ctp-red' : 'bg-ctp-peach/15 text-ctp-peach'"
        >
          {{ recipient.bounceType }}
        </span>
        <span class="text-ctp-text">{{ recipient.address }}</span>
        <span v-if="recipient.reason" class="text-xs text-ctp-subtext0">— {{ recipient.reason }}</span>
      </div>
    </div>

    <LinkedSignalSummary v-if="linkedSignal" :signal="linkedSignal" label="Sent email" />
  </div>
</template>

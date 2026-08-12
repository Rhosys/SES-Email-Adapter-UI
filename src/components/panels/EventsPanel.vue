<script setup lang="ts">
import { computed } from 'vue'
import type { EventsData } from '@/types/server'
import { useClipboard } from '@/composables/useClipboard'
import { formatResourceDate, dayKey } from '@/lib/resourceDate'

const props = defineProps<{ data: EventsData }>()
const { copied, copy } = useClipboard()

const typeLabel: Record<EventsData['eventType'], string> = {
  ticket_confirmation: 'Ticket confirmed',
  reminder: 'Reminder',
  update: 'Update',
  cancellation: 'Cancelled',
  venue_change: 'Venue changed',
}

const formattedAmount = computed(() => {
  if (!props.data.totalAmount) return null
  const num = parseFloat(props.data.totalAmount)
  if (!Number.isFinite(num)) return props.data.totalAmount
  const fmt = new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: props.data.currency ?? 'USD',
  })
  return fmt.format(num)
})

const eventDateLabel = computed(() => {
  if (!props.data.eventStartDatetime) return null
  const key = dayKey(props.data.eventStartDatetime)
  const now = new Date()
  const tomorrow = new Date(now)
  tomorrow.setDate(now.getDate() + 1)
  return {
    text: formatResourceDate(props.data.eventStartDatetime),
    urgent: key === dayKey(now) || key === dayKey(tomorrow),
  }
})
</script>

<template>
  <div class="rounded-lg border border-ctp-surface1 bg-ctp-mantle p-4">
    <div class="mb-2 flex flex-wrap items-start justify-between gap-2">
      <div>
        <span class="text-sm font-medium text-ctp-text">{{ data.eventName }}</span>
        <span class="ml-2 text-xs text-ctp-subtext0">{{ typeLabel[data.eventType] }}</span>
      </div>

      <div v-if="data.ticketReference" class="flex items-center gap-1">
        <code class="rounded bg-ctp-surface1 px-2 py-0.5 font-mono text-xs text-ctp-text">
          {{ data.ticketReference }}
        </code>
        <button
          class="text-xs text-ctp-subtext0 hover:text-ctp-text"
          @click="copy(data.ticketReference!)"
        >
          {{ copied ? '✓' : 'Copy' }}
        </button>
      </div>
    </div>

    <div v-if="data.venueName" class="mb-1 text-sm text-ctp-text">
      📍 {{ data.venueName }}
      <span v-if="data.venueAddress" class="text-xs text-ctp-subtext0"> — {{ data.venueAddress }}</span>
    </div>

    <div v-if="data.performer" class="mb-1 text-sm text-ctp-subtext0">
      🎤 {{ data.performer }}
    </div>

    <p
      v-if="eventDateLabel"
      class="mb-1 text-sm"
      :class="eventDateLabel.urgent ? 'font-medium text-ctp-peach' : 'text-ctp-subtext0'"
    >
      {{ eventDateLabel.text }}
    </p>

    <div v-if="data.seatDetails || data.ticketCount" class="mt-1 text-xs text-ctp-subtext0">
      <span v-if="data.seatDetails">{{ data.seatDetails }}</span>
      <span v-if="data.seatDetails && data.ticketCount"> · </span>
      <span v-if="data.ticketCount">{{ data.ticketCount }} ticket{{ data.ticketCount !== '1' ? 's' : '' }}</span>
    </div>

    <div v-if="formattedAmount" class="mt-2 text-sm font-medium text-ctp-text">
      {{ formattedAmount }}
    </div>

    <a
      v-if="data.ticketUrl"
      :href="data.ticketUrl"
      target="_blank"
      rel="noopener noreferrer"
      class="mt-2 inline-block rounded border border-ctp-surface1 px-3 py-1.5 text-xs text-ctp-text hover:bg-ctp-surface1"
    >
      View tickets →
    </a>
  </div>
</template>

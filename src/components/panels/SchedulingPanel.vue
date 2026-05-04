<script setup lang="ts">
import { computed } from 'vue'
import type { SchedulingData } from '@/types/server'

const props = defineProps<{ data: SchedulingData }>()

const eventTypeLabel: Record<SchedulingData['eventType'], string> = {
  meeting_invite: 'Meeting invite',
  appointment: 'Appointment',
  reminder: 'Reminder',
  cancellation: 'Cancellation',
  reschedule: 'Reschedule',
  confirmation: 'Confirmation',
}

const isCancelled = computed(() => props.data.eventType === 'cancellation')

const timeLabel = computed(() => {
  if (!props.data.startTime) return null
  const start = new Date(props.data.startTime)
  const startStr = start.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
  if (!props.data.endTime) return startStr
  const end = new Date(props.data.endTime)
  const endStr = end.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  const durationMs = end.getTime() - start.getTime()
  const durationMins = Math.round(durationMs / 60_000)
  const durationLabel =
    durationMins < 60
      ? `${durationMins}m`
      : `${Math.floor(durationMins / 60)}h${durationMins % 60 > 0 ? ` ${durationMins % 60}m` : ''}`
  return `${startStr}–${endStr} (${durationLabel})`
})

const isVideoCall = computed(() => {
  if (!props.data.location) return false
  return /zoom|meet|teams|around|webex/i.test(props.data.location)
})
</script>

<template>
  <div class="rounded-lg border border-ctp-surface1 bg-ctp-mantle p-4">
    <div class="mb-2 flex items-start justify-between gap-2">
      <div>
        <p
          class="text-sm font-medium"
          :class="isCancelled ? 'line-through text-ctp-subtext0' : 'text-ctp-text'"
        >
          {{ data.title }}
        </p>
        <p class="text-xs text-ctp-subtext0">{{ eventTypeLabel[data.eventType] }}</p>
      </div>
      <span
        v-if="data.requiresResponse"
        class="rounded-full border border-ctp-peach px-2 py-0.5 text-xs text-ctp-peach"
      >
        RSVP needed
      </span>
    </div>

    <p v-if="timeLabel" class="mb-1 text-sm text-ctp-text">{{ timeLabel }}</p>

    <div v-if="data.location" class="mb-1 flex items-center gap-1 text-xs text-ctp-subtext0">
      <span>{{ isVideoCall ? '📹' : '📍' }}</span>
      <span>{{ isVideoCall ? 'Video call' : data.location }}</span>
    </div>

    <p v-if="data.organizer" class="text-xs text-ctp-subtext0">Invited by {{ data.organizer }}</p>

    <p v-if="data.attendees?.length" class="text-xs text-ctp-subtext0">
      {{ data.attendees.length }} attendee{{ data.attendees.length === 1 ? '' : 's' }}
    </p>

    <div v-if="data.calendarUrl" class="mt-3">
      <a
        :href="data.calendarUrl"
        target="_blank"
        rel="noopener noreferrer"
        class="text-xs text-ctp-blue hover:underline"
      >
        Add to calendar →
      </a>
    </div>
  </div>
</template>

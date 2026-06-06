<script setup lang="ts">
import { computed } from 'vue'
import type { CalendarResponseSignal } from '@/types/server'

const props = defineProps<{ signal: CalendarResponseSignal }>()

const responseLabel = computed(() => {
  switch (props.signal.data.rsvpResponse) {
    case 'accepted': return 'Accepted'
    case 'declined': return 'Declined'
    case 'tentative': return 'Tentative'
    default: return props.signal.data.rsvpResponse
  }
})

const responseColor = computed(() => {
  switch (props.signal.data.rsvpResponse) {
    case 'accepted': return 'text-ctp-green'
    case 'declined': return 'text-ctp-red'
    case 'tentative': return 'text-ctp-peach'
    default: return 'text-ctp-text'
  }
})

const respondedAt = computed(() =>
  new Date(props.signal.data.respondedAt).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }),
)
</script>

<template>
  <div class="rounded-lg border border-ctp-surface1 bg-ctp-mantle p-4">
    <div class="flex items-center gap-2">
      <svg class="h-4 w-4 text-ctp-lavender" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
        <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm3.5 5.5l-4 4L5 8l1-1 1.5 1.5 3-3 1 1z"/>
      </svg>
      <span class="text-sm text-ctp-text">
        RSVP: <span :class="responseColor" class="font-medium">{{ responseLabel }}</span>
      </span>
      <span class="ml-auto text-xs text-ctp-subtext0">{{ respondedAt }}</span>
    </div>
  </div>
</template>

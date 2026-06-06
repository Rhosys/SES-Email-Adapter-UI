<script setup lang="ts">
import { computed } from 'vue'
import type { TravelData } from '@/types/server'
import { useClipboard } from '@/composables/useClipboard'

const props = defineProps<{ data: TravelData }>()

const { copied, copy } = useClipboard()

const typeLabel: Record<TravelData['travelType'], string> = {
  flight: 'Flight',
  hotel: 'Hotel',
  car_rental: 'Car rental',
  train: 'Train',
  cruise: 'Cruise',
  activity: 'Activity',
  itinerary: 'Itinerary',
  check_in_reminder: 'Check-in reminder',
  boarding_pass: 'Boarding pass',
}

const departureLabel = computed(() => {
  if (!props.data.departureDate) return null
  const d = new Date(props.data.departureDate)
  const now = new Date()
  const diffMs = d.getTime() - now.getTime()
  const diffHours = diffMs / 3_600_000
  if (diffHours < 0) return { text: 'Departed', urgent: false }
  if (diffHours < 2) {
    const mins = Math.floor(diffMs / 60_000)
    return { text: `In ${mins}m`, urgent: true }
  }
  if (diffHours < 24) {
    return {
      text: `Today ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`,
      urgent: true,
    }
  }
  if (diffHours < 48) {
    return {
      text: `Tomorrow ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`,
      urgent: false,
    }
  }
  return {
    text: d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }),
    urgent: false,
  }
})
</script>

<template>
  <div class="rounded-lg border border-ctp-surface1 bg-ctp-mantle p-4">
    <div class="mb-2 flex flex-wrap items-start justify-between gap-2">
      <div>
        <span class="text-sm font-medium text-ctp-text">{{ data.provider }}</span>
        <span class="ml-2 text-xs text-ctp-subtext0">{{ typeLabel[data.travelType] }}</span>
      </div>

      <div v-if="data.confirmationNumber" class="flex items-center gap-1">
        <code class="rounded bg-ctp-surface1 px-2 py-0.5 font-mono text-xs text-ctp-text">
          {{ data.confirmationNumber }}
        </code>
        <button
          class="text-xs text-ctp-subtext0 hover:text-ctp-text"
          @click="copy(data.confirmationNumber!)"
        >
          {{ copied ? '✓' : 'Copy' }}
        </button>
      </div>
    </div>

    <!-- Route for flights/trains -->
    <div v-if="data.origin && data.destination" class="mb-2 text-base font-semibold text-ctp-text">
      {{ data.origin }} → {{ data.destination }}
    </div>

    <p
      v-if="departureLabel"
      class="text-sm"
      :class="departureLabel.urgent ? 'font-medium text-ctp-peach' : 'text-ctp-subtext0'"
    >
      {{ departureLabel.text }}
    </p>

    <div v-if="data.passengers?.length" class="mt-1 text-xs text-ctp-subtext0">
      Passenger{{ data.passengers.length > 1 ? 's' : '' }}: {{ data.passengers.map(p => p.name).join(', ') }}
    </div>
  </div>
</template>

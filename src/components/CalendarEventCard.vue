<script setup lang="ts">
import { computed, ref } from 'vue'
import type { CalendarEventSignal } from '@/types/server'
import { useAccountStore } from '@/stores/account'
import { api } from '@/lib/api'

type RsvpResponse = 'accepted' | 'declined' | 'tentative'

const props = defineProps<{ signal: CalendarEventSignal }>()

const accountStore = useAccountStore()
const loading = ref<RsvpResponse | null>(null)
const error = ref<string | null>(null)
const rsvpStatus = ref<RsvpResponse | null>(null)

const formattedStart = computed(() =>
  new Date(props.signal.data.startTime).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }),
)

const formattedEnd = computed(() => {
  if (!props.signal.data.endTime) return null
  return new Date(props.signal.data.endTime).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
})

async function handleRsvp(response: RsvpResponse) {
  if (!accountStore.accountId || loading.value) return
  loading.value = response
  error.value = null
  const result = await api.rsvpSignal(accountStore.accountId, props.signal.signalId, response)
  loading.value = null
  if (result.isOk()) {
    rsvpStatus.value = response
  } else {
    error.value = result.error.message
  }
}
</script>

<template>
  <div class="rounded-lg border border-ctp-surface1 bg-ctp-mantle p-4">
    <div class="mb-2 flex items-center gap-2">
      <svg class="h-4 w-4 text-ctp-blue" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
        <path d="M4 0v1H2a2 2 0 00-2 2v11a2 2 0 002 2h12a2 2 0 002-2V3a2 2 0 00-2-2h-2V0h-1v1H5V0H4zm-2 5h12v9H2V5z"/>
      </svg>
      <span class="text-sm font-medium text-ctp-text">{{ signal.data.title }}</span>
      <span class="ml-auto text-xs text-ctp-subtext0">{{ new Date(signal.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) }}</span>
    </div>

    <div class="mb-3 space-y-1 text-sm text-ctp-subtext1">
      <p>
        <span class="text-ctp-subtext0">When:</span> {{ formattedStart }}
        <template v-if="formattedEnd"> — {{ formattedEnd }}</template>
      </p>
      <p v-if="signal.data.location">
        <span class="text-ctp-subtext0">Where:</span> {{ signal.data.location }}
      </p>
      <p>
        <span class="text-ctp-subtext0">Organizer:</span> {{ signal.data.organizerName || signal.data.organizer }}
      </p>
      <p v-if="signal.data.description" class="text-xs text-ctp-subtext0">
        {{ signal.data.description }}
      </p>
    </div>

    <!-- Attendees -->
    <div v-if="signal.data.attendees.length > 0" class="mb-3">
      <p class="mb-1 text-xs text-ctp-subtext0">Attendees:</p>
      <div class="flex flex-wrap gap-1">
        <span
          v-for="attendee in signal.data.attendees"
          :key="attendee.address"
          class="rounded-full bg-ctp-surface1 px-2 py-0.5 text-xs text-ctp-subtext1"
          :title="attendee.address"
        >
          {{ attendee.name || attendee.address }}
          <span v-if="attendee.optional" class="text-ctp-subtext0">(optional)</span>
        </span>
      </div>
    </div>

    <!-- RSVP -->
    <div v-if="rsvpStatus" class="border-t border-ctp-surface1 pt-3">
      <p class="text-xs text-ctp-subtext1">
        You {{ rsvpStatus === 'accepted' ? 'accepted' : rsvpStatus === 'declined' ? 'declined' : 'tentatively accepted' }} this event.
      </p>
    </div>
    <div v-else class="border-t border-ctp-surface1 pt-3">
      <p v-if="error" class="mb-2 text-xs text-ctp-red">{{ error }}</p>
      <div class="flex items-center gap-2">
        <button
          :disabled="loading !== null"
          class="rounded border border-ctp-green px-3 py-1 text-xs font-medium text-ctp-green transition-colors hover:bg-ctp-green/10 disabled:opacity-50"
          @click="handleRsvp('accepted')"
        >
          {{ loading === 'accepted' ? 'Accepting…' : 'Accept' }}
        </button>
        <button
          :disabled="loading !== null"
          class="rounded border border-ctp-peach px-3 py-1 text-xs font-medium text-ctp-peach transition-colors hover:bg-ctp-peach/10 disabled:opacity-50"
          @click="handleRsvp('tentative')"
        >
          {{ loading === 'tentative' ? 'Responding…' : 'Tentative' }}
        </button>
        <button
          :disabled="loading !== null"
          class="rounded border border-ctp-red px-3 py-1 text-xs font-medium text-ctp-red transition-colors hover:bg-ctp-red/10 disabled:opacity-50"
          @click="handleRsvp('declined')"
        >
          {{ loading === 'declined' ? 'Declining…' : 'Decline' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { CalendarEventSignal, Signal } from '@/types/server'
import { useAccountStore } from '@/stores/account'
import { api } from '@/lib/api'
import LinkedSignalSummary from '@/components/LinkedSignalSummary.vue'
import AsyncButton from '@/components/ui/AsyncButton.vue'

type RsvpResponse = 'accepted' | 'declined' | 'tentative'

const props = defineProps<{ signal: CalendarEventSignal; linkedSignal?: Signal }>()

const accountStore = useAccountStore()
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

function rsvpAction(response: RsvpResponse) {
  return async () => {
    if (!accountStore.accountId) return
    error.value = null
    const result = await api.rsvpSignal(accountStore.accountId, props.signal.arcId!, props.signal.signalId, response)
    if (result.isOk()) {
      rsvpStatus.value = response
    } else {
      error.value = result.error.message
      throw new Error(result.error.message)
    }
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
      <a
        v-if="signal.data.url"
        :href="signal.data.url"
        target="_blank"
        rel="noopener noreferrer"
        class="mt-2 inline-flex items-center gap-1 text-xs text-ctp-blue hover:underline"
      >
        View in calendar ↗
      </a>
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
        <AsyncButton
          :action="rsvpAction('accepted')"
          variant="outline"
          class="border-ctp-green text-ctp-green hover:bg-ctp-green/10"
        >
          Accept
        </AsyncButton>
        <AsyncButton
          :action="rsvpAction('tentative')"
          variant="outline"
          class="border-ctp-peach text-ctp-peach hover:bg-ctp-peach/10"
        >
          Tentative
        </AsyncButton>
        <AsyncButton
          :action="rsvpAction('declined')"
          variant="outline"
          class="border-ctp-red text-ctp-red hover:bg-ctp-red/10"
        >
          Decline
        </AsyncButton>
      </div>
    </div>

    <LinkedSignalSummary v-if="linkedSignal" :signal="linkedSignal" label="Received via" />
  </div>
</template>

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

const isCancelled = computed(() => Boolean(props.signal.data.cancelledAt))

const previousValues = computed(() => props.signal.data.previousValues)

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function rsvpAction(response: RsvpResponse) {
  return async () => {
    if (!accountStore.accountId) return
    error.value = null
    const result = await api.rsvpSignal(accountStore.accountId, props.signal.threadId!, props.signal.signalId, response)
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
      <span class="text-sm font-medium text-ctp-text" :class="{ 'line-through text-ctp-subtext0': isCancelled }">{{ signal.data.title }}</span>
      <span
        v-if="isCancelled"
        class="rounded-full bg-ctp-red/15 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-ctp-red"
      >
        Cancelled
      </span>
    </div>

    <div class="mb-3 space-y-1 text-sm text-ctp-subtext1">
      <p>
        <span class="text-ctp-subtext0">When:</span>
        <template v-if="previousValues?.startTime">
          <span class="text-xs text-ctp-subtext0 line-through">{{ formatDateTime(previousValues.startTime) }}</span>
          <span class="mx-1 text-ctp-peach">→</span>
        </template>
        <span :class="{ 'line-through text-ctp-subtext0': isCancelled }">
          {{ formattedStart }}
          <template v-if="formattedEnd"> — {{ formattedEnd }}</template>
        </span>
      </p>
      <p v-if="signal.data.location">
        <span class="text-ctp-subtext0">Where:</span>
        <template v-if="previousValues?.location">
          <span class="text-xs text-ctp-subtext0 line-through">{{ previousValues.location }}</span>
          <span class="mx-1 text-ctp-peach">→</span>
        </template>
        <span :class="{ 'line-through text-ctp-subtext0': isCancelled }">{{ signal.data.location }}</span>
      </p>
      <p>
        <span class="text-ctp-subtext0">Organizer:</span> {{ signal.data.organizerName || signal.data.organizer }}
      </p>
      <p v-if="signal.data.description" class="whitespace-pre-line text-xs text-ctp-subtext0">
        {{ signal.data.description }}
      </p>
      <p v-if="previousValues" class="text-xs text-ctp-peach">
        This event was updated{{ ' ' }}{{ formatDateTime(previousValues.changedAt) }}.
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

    <!-- Cancelled: no RSVP is possible, just inform. -->
    <div v-if="isCancelled" class="border-t border-ctp-surface1 pt-3">
      <p class="text-xs font-medium text-ctp-red">This event was cancelled by the organizer.</p>
    </div>
    <!-- RSVP -->
    <div v-else-if="rsvpStatus" class="border-t border-ctp-surface1 pt-3">
      <p class="text-xs text-ctp-subtext1">
        You {{ rsvpStatus === 'accepted' ? 'accepted' : rsvpStatus === 'declined' ? 'declined' : 'tentatively accepted' }} this event.
      </p>
    </div>
    <div v-else class="border-t border-ctp-surface1 pt-3">
      <p v-if="error" class="mb-2 text-xs text-ctp-red">{{ error }}</p>
      <div class="flex items-center gap-2">
        <AsyncButton
          :action="rsvpAction('accepted')"
          class="rounded-md border border-ctp-green bg-ctp-green/10 px-3 py-1.5 text-sm font-medium text-ctp-green hover:bg-ctp-green hover:text-ctp-base"
        >
          Accept
        </AsyncButton>
        <AsyncButton
          :action="rsvpAction('tentative')"
          class="rounded-md border border-ctp-peach bg-ctp-peach/10 px-3 py-1.5 text-sm font-medium text-ctp-peach hover:bg-ctp-peach hover:text-ctp-base"
        >
          Tentative
        </AsyncButton>
        <AsyncButton
          :action="rsvpAction('declined')"
          class="rounded-md border border-ctp-red bg-ctp-red/10 px-3 py-1.5 text-sm font-medium text-ctp-red hover:bg-ctp-red hover:text-ctp-base"
        >
          Decline
        </AsyncButton>
      </div>
    </div>

    <LinkedSignalSummary v-if="linkedSignal" :signal="linkedSignal" label="Received via" />
  </div>
</template>

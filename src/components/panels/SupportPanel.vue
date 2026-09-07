<script setup lang="ts">
import { computed } from 'vue'
import type { SupportData } from '@/types/server'
import { useClipboard } from '@/composables/useClipboard'

const props = defineProps<{ data: SupportData; compact?: boolean }>()
const { copied, copy } = useClipboard()

type TicketStep = 'open' | 'in_progress' | 'awaiting' | 'resolved'
const steps: TicketStep[] = ['open', 'in_progress', 'awaiting', 'resolved']
const stepLabels: Record<TicketStep, string> = {
  open: 'Open',
  in_progress: 'In progress',
  awaiting: 'Awaiting response',
  resolved: 'Resolved',
}

const eventToStep: Record<SupportData['eventType'], TicketStep> = {
  ticket_opened: 'open',
  ticket_updated: 'in_progress',
  status_update: 'in_progress',
  awaiting_response: 'awaiting',
  ticket_resolved: 'resolved',
  ticket_closed: 'resolved',
}

const activeStep = computed(() => eventToStep[props.data.eventType])
const activeIndex = computed(() => steps.indexOf(activeStep.value))

const statusLabel: Record<SupportData['eventType'], string> = {
  ticket_opened: 'Ticket opened',
  ticket_updated: 'Agent replied',
  status_update: 'Status update',
  awaiting_response: 'Awaiting your response',
  ticket_resolved: 'Resolved',
  ticket_closed: 'Closed',
}

const isResolved = computed(() =>
  ['ticket_resolved', 'ticket_closed'].includes(props.data.eventType),
)
const isAwaiting = computed(() => props.data.eventType === 'awaiting_response')

function segmentClass(i: number): string {
  if (isResolved.value) return i <= activeIndex.value ? 'bg-ctp-green' : 'bg-ctp-surface1'
  if (isAwaiting.value) {
    if (i < activeIndex.value) return 'bg-ctp-blue'
    if (i === activeIndex.value) return 'bg-ctp-peach'
    return 'bg-ctp-surface1'
  }
  return i <= activeIndex.value ? 'bg-ctp-blue' : 'bg-ctp-surface1'
}
</script>

<template>
  <!-- Compact: single row for inbox thread list -->
  <div v-if="compact" class="flex items-center gap-2 text-xs">
    <span class="shrink-0 text-ctp-subtext0">🎫</span>
    <span class="shrink-0 font-medium text-ctp-text">{{ data.service }}</span>
    <span class="shrink-0" :class="isAwaiting ? 'text-ctp-peach' : isResolved ? 'text-ctp-green' : 'text-ctp-subtext0'">{{ statusLabel[data.eventType] }}</span>
    <span v-if="data.ticketId" class="shrink-0 font-mono text-ctp-subtext0">#{{ data.ticketId }}</span>
    <button
      v-if="data.ticketId"
      class="shrink-0 text-ctp-subtext0 hover:text-ctp-text"
      @click.prevent="copy(`#${data.ticketId}`)"
    >
      {{ copied ? '✓' : 'Copy' }}
    </button>
    <a
      v-if="data.responseUrl"
      :href="data.responseUrl"
      target="_blank"
      rel="noopener noreferrer"
      class="ml-auto shrink-0 text-ctp-blue hover:underline"
      @click.stop
    >
      Respond →
    </a>
  </div>

  <!-- Full: detail view card -->
  <div v-else class="rounded-lg border border-ctp-surface1 bg-ctp-mantle p-4">
    <div class="mb-2 flex flex-wrap items-start justify-between gap-2">
      <div>
        <span class="text-sm font-medium text-ctp-text">{{ data.service }}</span>
        <span
          class="ml-2 text-xs"
          :class="
            isAwaiting
              ? 'font-medium text-ctp-peach'
              : isResolved
                ? 'text-ctp-green'
                : 'text-ctp-subtext0'
          "
        >
          {{ statusLabel[data.eventType] }}
        </span>
      </div>
      <div class="flex items-center gap-1">
        <code
          v-if="data.ticketId"
          class="rounded bg-ctp-surface1 px-2 py-0.5 font-mono text-xs text-ctp-text"
        >
          #{{ data.ticketId }}
        </code>
        <button
          v-if="data.ticketId"
          class="text-xs text-ctp-subtext0 hover:text-ctp-text"
          @click="copy(`#${data.ticketId}`)"
        >
          {{ copied ? '✓' : 'Copy' }}
        </button>
      </div>
    </div>

    <!-- Ticket status bar -->
    <div class="mb-3">
      <div class="mb-1.5 flex gap-1">
        <div
          v-for="(step, i) in steps"
          :key="step"
          class="h-1.5 flex-1 rounded-full transition-colors"
          :class="segmentClass(i)"
        />
      </div>
      <span
        class="text-xs font-medium"
        :class="
          isResolved
            ? 'text-ctp-green'
            : isAwaiting
              ? 'text-ctp-peach'
              : 'text-ctp-text'
        "
      >
        {{ stepLabels[activeStep] }}
      </span>
    </div>

    <div v-if="data.agentName" class="text-xs text-ctp-subtext0">Agent: {{ data.agentName }}</div>

    <div v-if="data.priority" class="mt-1 text-xs text-ctp-subtext0">
      Priority:
      <span
        :class="
          data.priority === 'urgent'
            ? 'text-ctp-red'
            : data.priority === 'high'
              ? 'text-ctp-peach'
              : ''
        "
        >{{ data.priority }}</span
      >
    </div>

    <div v-if="data.responseUrl" class="mt-3">
      <a
        :href="data.responseUrl"
        target="_blank"
        rel="noopener noreferrer"
        class="text-xs text-ctp-blue hover:underline"
      >
        View in portal →
      </a>
    </div>
  </div>
</template>

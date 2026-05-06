<script setup lang="ts">
import { computed } from 'vue'
import type { SupportData } from '@/types/server'
import { useClipboard } from '@/composables/useClipboard'

const props = defineProps<{ data: SupportData }>()
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
</script>

<template>
  <div class="rounded-lg border border-ctp-surface1 bg-ctp-mantle p-4">
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
    <div class="mb-3 flex items-center gap-0">
      <template v-for="(step, i) in steps" :key="step">
        <div class="flex flex-col items-center">
          <div
            class="h-2.5 w-2.5 rounded-full border-2 transition-colors"
            :class="
              i <= activeIndex
                ? isResolved
                  ? 'border-ctp-green bg-ctp-green'
                  : isAwaiting && i === activeIndex
                    ? 'border-ctp-peach bg-ctp-peach'
                    : 'border-ctp-blue bg-ctp-blue'
                : 'border-ctp-overlay0 bg-transparent'
            "
          />
          <span class="mt-1 text-xs text-ctp-subtext0" style="white-space: nowrap">
            {{ stepLabels[step] }}
          </span>
        </div>
        <div
          v-if="i < steps.length - 1"
          class="mb-3 h-0.5 flex-1 transition-colors"
          :class="i < activeIndex ? 'bg-ctp-blue' : 'bg-ctp-overlay0'"
        />
      </template>
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

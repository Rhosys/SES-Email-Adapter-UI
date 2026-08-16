<script setup lang="ts">
import { computed, inject } from 'vue'
import { RouterLink } from 'vue-router'
import type { Thread } from '@/types/server'
import { NOW_KEY } from '@/composables/useRelativeTime'
import { formatRelativeTime } from '@/composables/useFormattedTime'
import { useLabelsStore } from '@/stores/labels'
import { useSignalsStore } from '@/stores/signals'
import { visibleLabels, findLabelMeta } from '@/lib/labels'
import { aggregateWorkflowPanels } from '@/lib/workflow-aggregator'
import type { WorkflowGroup } from '@/lib/workflow-aggregator'
import { groupByBodyFingerprint, attachLinkedSignals } from '@/lib/dedup'
import WorkflowPanel from './WorkflowPanel.vue'

const RECENCY_WINDOW_MS = 15 * 60 * 1000

const props = defineProps<{ thread: Thread }>()

const now = inject(NOW_KEY)
const labelsStore = useLabelsStore()
const signalsStore = useSignalsStore()

const timestamp = computed(() =>
  now ? formatRelativeTime(props.thread.lastSignalAt ?? props.thread.createdAt, now.value) : '',
)

const hasPendingSend = computed(() =>
  signalsStore.allSignals.some(s => s.status === 'pending_send' && s.threadId === props.thread.threadId)
)

const isRecent = computed(() => {
  if (!props.thread.lastSignalAt) return false
  return Date.now() - new Date(props.thread.lastSignalAt).getTime() < RECENCY_WINDOW_MS
})

const snoozeBadge = computed(() => {
  if (!props.thread.followupAt || props.thread.status !== 'active') return null
  const followup = new Date(props.thread.followupAt)
  if (followup.getTime() > Date.now()) return null
  const today = new Date()
  if (followup.toDateString() === today.toDateString()) return 'Snoozed until today'
  return `Snoozed until ${followup.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
})

const mergedWorkflowGroup = computed((): WorkflowGroup | null => {
  if (!isRecent.value) return null
  const signals = signalsStore.threadSignals(props.thread.threadId)
  if (signals.length === 0) return null
  const deduped = attachLinkedSignals(groupByBodyFingerprint(signals))
  const groups = aggregateWorkflowPanels(deduped)
  const group = groups[0]
  if (!group || group.entries.length === 0) return null
  return { workflow: group.workflow, entries: [group.entries[0]] }
})

function labelColor(key: string): string {
  return findLabelMeta(labelsStore.items, key)?.color ?? '#cba6f7'
}
</script>

<template>
  <RouterLink :to="{ name: 'thread-detail', params: { id: thread.threadId } }" class="min-w-0 flex-1">
    <!-- Row 1: sender identity + addresses + (desktop-only: badges & timestamp) -->
    <div class="flex flex-wrap items-center gap-x-2 gap-y-0.5">
      <span class="shrink-0 text-[15px] font-semibold text-ctp-text sm:text-sm">{{ thread.sender.name || thread.sender.address }}</span>
      <span v-if="thread.sender.name" class="shrink-0 text-xs text-ctp-subtext0">{{ thread.sender.address }}</span>
      <span v-if="thread.recipientAddress" class="shrink-0 text-xs text-ctp-subtext0">→ {{ thread.recipientAddress }}</span>
      <span v-if="hasPendingSend" class="hidden shrink-0 rounded-full bg-ctp-green/15 px-1.5 py-0.5 text-xs text-ctp-green sm:inline">Sent</span>
      <span v-if="snoozeBadge" class="hidden shrink-0 rounded-full bg-ctp-yellow/15 px-1.5 py-0.5 text-xs text-ctp-yellow sm:inline">{{ snoozeBadge }}</span>
      <span class="ml-auto hidden shrink-0 text-xs text-ctp-subtext0 sm:inline">{{ timestamp }}</span>
    </div>

    <!-- Row 2: subject -->
    <div class="mt-0.5 text-[15px] text-ctp-subtext1 sm:truncate sm:text-sm">{{ thread.subject || thread.summary }}</div>

    <!-- Row 3 (mobile-only): badges + timestamp -->
    <div class="mt-0.5 flex items-center gap-2 sm:hidden">
      <span v-if="hasPendingSend" class="shrink-0 rounded-full bg-ctp-green/15 px-1.5 py-0.5 text-xs text-ctp-green">Sent</span>
      <span v-if="snoozeBadge" class="shrink-0 rounded-full bg-ctp-yellow/15 px-1.5 py-0.5 text-xs text-ctp-yellow">{{ snoozeBadge }}</span>
      <span class="ml-auto shrink-0 text-xs text-ctp-subtext0">{{ timestamp }}</span>
    </div>

    <!-- Row 3 (desktop): summary preview if different from subject -->
    <div v-if="thread.summary && thread.subject" class="mt-0.5 hidden truncate text-xs text-ctp-subtext0 sm:block">{{ thread.summary }}</div>

    <!-- Labels (shared) -->
    <div v-if="visibleLabels(thread.labels).length" class="mt-0.5 flex flex-wrap items-center gap-1.5">
      <span
        v-for="label in visibleLabels(thread.labels)"
        :key="label"
        class="h-2 w-2 shrink-0 rounded-full"
        :style="{ backgroundColor: labelColor(label) }"
      />
    </div>

    <WorkflowPanel v-if="mergedWorkflowGroup" :workflow-group="mergedWorkflowGroup" compact class="mt-1" />
  </RouterLink>
</template>

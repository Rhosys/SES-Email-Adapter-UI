<script setup lang="ts">
import { computed, inject } from 'vue'
import { RouterLink } from 'vue-router'
import type { Thread } from '@/types/server'
import { NOW_KEY } from '@/composables/useRelativeTime'
import { formatRelativeTime } from '@/composables/useFormattedTime'
import { useLabelsQuery } from '@/composables/useLabelsQueries'
import { useSignalCacheHelpers } from '@/composables/useSignalQueries'
import { visibleLabels, findLabelMeta } from '@/lib/labels'
import { aggregateWorkflowPanels } from '@/lib/workflow-aggregator'
import type { WorkflowGroup } from '@/lib/workflow-aggregator'
import { groupByBodyFingerprint, attachLinkedSignals } from '@/lib/dedup'
import WorkflowPanel from './WorkflowPanel.vue'

const RECENCY_WINDOW_MS = 15 * 60 * 1000

const props = defineProps<{ thread: Thread }>()

const now = inject(NOW_KEY)
const { labels } = useLabelsQuery()
const { threadSignals, allSignals } = useSignalCacheHelpers()

const timestamp = computed(() =>
  now ? formatRelativeTime(props.thread.lastSignalAt ?? props.thread.createdAt, now.value) : '',
)

const hasPendingSend = computed(() =>
  allSignals().some(s => s.status === 'pending_send' && s.threadId === props.thread.threadId)
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
  const signals = threadSignals(props.thread.threadId)
  if (signals.length === 0) return null
  const deduped = attachLinkedSignals(groupByBodyFingerprint(signals))
  const groups = aggregateWorkflowPanels(deduped)
  const group = groups[0]
  if (!group || group.entries.length === 0) return null
  return { workflow: group.workflow, entries: [group.entries[0]] }
})

function labelColor(key: string): string {
  return findLabelMeta(labels.value, key)?.color ?? '#cba6f7'
}
</script>

<template>
  <RouterLink :to="{ name: 'thread-detail', params: { id: thread.threadId } }" class="min-w-0 flex-1">
    <!-- Row 1: Sender Name  Sender Email  ———  Time -->
    <div class="flex items-center gap-x-2">
      <span class="shrink-0 text-[15px] font-semibold text-ctp-text sm:text-sm">{{ thread.sender.name || thread.sender.address }}</span>
      <span v-if="thread.sender.name" class="shrink-0 text-xs text-ctp-subtext0">{{ thread.sender.address }}</span>
      <span class="ml-auto shrink-0 text-xs text-ctp-subtext0">{{ timestamp }}</span>
    </div>

    <!-- Row 2: → Alias -->
    <div v-if="thread.recipientAddress" class="mt-0.5 text-xs text-ctp-subtext0">→ {{ thread.recipientAddress }}</div>

    <!-- Gap -->
    <div class="mt-2"></div>

    <!-- Row 3: Subject -->
    <div class="truncate text-[15px] text-ctp-subtext1 sm:text-sm">{{ thread.subject || thread.summary }}</div>

    <!-- Row 4: Summary [BADGES] -->
    <div class="mt-0.5 flex items-center gap-2">
      <span v-if="thread.summary && thread.subject" class="min-w-0 truncate text-xs text-ctp-subtext0">{{ thread.summary }}</span>
      <span v-if="hasPendingSend" class="shrink-0 rounded-full bg-ctp-green/15 px-1.5 py-0.5 text-xs text-ctp-green">Sent</span>
      <span v-if="snoozeBadge" class="shrink-0 rounded-full bg-ctp-yellow/15 px-1.5 py-0.5 text-xs text-ctp-yellow">{{ snoozeBadge }}</span>
      <div v-if="visibleLabels(thread.labels).length" class="flex items-center gap-1.5">
        <span
          v-for="label in visibleLabels(thread.labels)"
          :key="label"
          class="h-2 w-2 shrink-0 rounded-full"
          :style="{ backgroundColor: labelColor(label) }"
          role="img"
          :aria-label="`Label: ${label}`"
        />
      </div>
    </div>

    <WorkflowPanel v-if="mergedWorkflowGroup" :workflow-group="mergedWorkflowGroup" compact class="mt-1" />
  </RouterLink>
</template>

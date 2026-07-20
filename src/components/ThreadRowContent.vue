<script setup lang="ts">
import { computed, inject } from 'vue'
import { RouterLink } from 'vue-router'
import type { Thread } from '@/types/server'
import { NOW_KEY } from '@/composables/useRelativeTime'
import { formatRelativeTime } from '@/composables/useFormattedTime'
import { useLabelsStore } from '@/stores/labels'
import { useSignalsStore } from '@/stores/signals'
import { visibleLabels, findLabelMeta } from '@/lib/labels'

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

function labelColor(key: string): string {
  return findLabelMeta(labelsStore.items, key)?.color ?? '#cba6f7'
}
</script>

<template>
  <RouterLink :to="{ name: 'thread-detail', params: { id: thread.threadId } }" class="min-w-0 flex-1">
    <div class="flex items-center gap-2">
      <span class="w-28 shrink-0 truncate text-[15px] font-semibold text-ctp-text sm:w-40 sm:text-sm">{{ thread.senderAddress || 'Unknown' }}</span>
      <span class="flex-1 truncate text-[15px] text-ctp-subtext1 sm:text-sm">{{ thread.subject || thread.summary }}</span>
      <span v-if="hasPendingSend" class="shrink-0 rounded-full bg-ctp-peach/15 px-1.5 py-0.5 text-xs text-ctp-peach">Sending…</span>
      <span class="shrink-0 text-xs text-ctp-subtext0">{{ timestamp }}</span>
    </div>
    <div class="mt-0.5 flex items-center gap-1.5">
      <span
        v-for="label in visibleLabels(thread.labels)"
        :key="label"
        class="h-2 w-2 shrink-0 rounded-full"
        :style="{ backgroundColor: labelColor(label) }"
      />
      <span v-if="thread.summary && thread.subject" class="truncate text-xs text-ctp-subtext0">{{ thread.summary }}</span>
    </div>
  </RouterLink>
</template>

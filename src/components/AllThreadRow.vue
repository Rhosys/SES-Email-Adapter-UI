<script setup lang="ts">
import type { Thread } from '@/types/server'
import ThreadRowContent from './ThreadRowContent.vue'
import StatusBadge from './StatusBadge.vue'
import SwipeableThreadRow from './SwipeableThreadRow.vue'

defineProps<{ thread: Thread; selected: boolean; focused?: boolean }>()
const emit = defineEmits<{ 'toggle-select': [id: string] }>()
</script>

<template>
  <!-- No swipe action: the "all" tab mixes statuses, so there's no single quick
       action. Long-press still toggles selection. -->
  <SwipeableThreadRow
    class="thread-row"
    :data-thread-id="thread.threadId"
    :swipe-enabled="false"
    @long-press="emit('toggle-select', thread.threadId)"
  >
    <div
      class="group relative flex items-center gap-2 border-b border-ctp-surface0 px-3 py-3.5 transition-colors hover:bg-ctp-surface0 sm:py-2.5"
      :class="[focused && 'ring-1 ring-inset ring-ctp-mauve', selected && 'bg-ctp-surface1']"
      role="row"
    >
      <!-- Checkbox -->
      <div class="shrink-0 opacity-0 transition-opacity group-hover:opacity-100" :class="{ 'opacity-100': selected }">
        <input
          type="checkbox"
          :checked="selected"
          class="h-4 w-4 rounded border-ctp-overlay0 bg-ctp-surface1 accent-ctp-blue"
          :aria-label="`Select thread: ${thread.summary}`"
          @change="emit('toggle-select', thread.threadId)"
        />
      </div>

      <ThreadRowContent :thread="thread" />

      <!-- Status badge instead of actions -->
      <StatusBadge :status="thread.status" />
    </div>
  </SwipeableThreadRow>
</template>

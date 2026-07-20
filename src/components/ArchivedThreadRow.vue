<script setup lang="ts">
import type { Thread } from '@/types/server'
import { useThreadsStore } from '@/stores/threads'
import ThreadRowContent from './ThreadRowContent.vue'
import SwipeableThreadRow from './SwipeableThreadRow.vue'

const props = defineProps<{ thread: Thread; selected: boolean; focused?: boolean }>()
const emit = defineEmits<{ 'toggle-select': [id: string] }>()

const threadsStore = useThreadsStore()

async function unarchiveThread(close?: () => void) {
  close?.()
  await threadsStore.moveToInbox(props.thread.threadId)
}
</script>

<template>
  <SwipeableThreadRow
    class="thread-row"
    :data-thread-id="thread.threadId"
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

      <!-- Unarchive action (hover, desktop) -->
      <div class="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          class="flex h-7 items-center gap-1 rounded border border-ctp-surface1 px-2 text-xs text-ctp-subtext1 hover:border-ctp-green hover:text-ctp-green"
          title="Move to Inbox"
          @click.prevent="unarchiveThread()"
        >
          <svg class="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <g transform="rotate(90 8 8)"><path d="M8 1a1 1 0 011 1v5.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 011.414-1.414L7 7.586V2a1 1 0 011-1zM2 10a1 1 0 011 1v2h10v-2a1 1 0 112 0v3a1 1 0 01-1 1H2a1 1 0 01-1-1v-3a1 1 0 011-1z"/></g>
          </svg>
          Inbox
        </button>
      </div>
    </div>

    <!-- Swipe-to-reveal quick action (mobile) -->
    <template #action="{ close }">
      <button
        class="flex w-28 items-center justify-center gap-1.5 bg-ctp-green text-sm font-medium text-ctp-base"
        :aria-label="`Move to inbox: ${thread.summary}`"
        @click="unarchiveThread(close)"
      >
        <svg class="h-4 w-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <g transform="rotate(90 8 8)"><path d="M8 1a1 1 0 011 1v5.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 011.414-1.414L7 7.586V2a1 1 0 011-1zM2 10a1 1 0 011 1v2h10v-2a1 1 0 112 0v3a1 1 0 01-1 1H2a1 1 0 01-1-1v-3a1 1 0 011-1z"/></g>
        </svg>
        Inbox
      </button>
    </template>
  </SwipeableThreadRow>
</template>

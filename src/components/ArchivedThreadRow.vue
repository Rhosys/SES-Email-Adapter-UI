<script setup lang="ts">
import type { Thread } from '@/types/server'
import { useThreadsStore } from '@/stores/threads'
import ThreadRowContent from './ThreadRowContent.vue'

const props = defineProps<{ thread: Thread; selected: boolean; focused?: boolean }>()
const emit = defineEmits<{ 'toggle-select': [id: string] }>()

const threadsStore = useThreadsStore()

async function unarchiveThread() {
  await threadsStore.moveToInbox(props.thread.threadId)
}
</script>

<template>
  <div class="thread-row" :data-thread-id="thread.threadId">
    <div
      class="group relative flex items-center gap-2 border-b border-ctp-surface0 px-3 py-2.5 transition-colors hover:bg-ctp-surface0"
      :class="[focused && 'ring-1 ring-inset ring-ctp-mauve']"
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

      <!-- Unarchive action -->
      <div class="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          class="flex h-7 items-center gap-1 rounded border border-ctp-surface1 px-2 text-xs text-ctp-subtext1 hover:border-ctp-green hover:text-ctp-green"
          title="Move to Inbox"
          @click.prevent="unarchiveThread"
        >
          <svg class="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M1 11v3a1 1 0 001 1h12a1 1 0 001-1v-3H9.5l-1 2h-1l-1-2H1zm0-1h4l1 2h4l1-2h4V3a1 1 0 00-1-1H2a1 1 0 00-1 1v7z"/>
          </svg>
          Inbox
        </button>
      </div>
    </div>
  </div>
</template>

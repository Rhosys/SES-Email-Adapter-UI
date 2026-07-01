<script setup lang="ts">
import type { Thread } from '@/types/server'
import { useThreadsStore } from '@/stores/threads'
import ThreadRowContent from './ThreadRowContent.vue'

const props = defineProps<{ thread: Thread; selected: boolean; focused?: boolean }>()
const emit = defineEmits<{ 'toggle-select': [id: string] }>()

const threadsStore = useThreadsStore()

async function archiveThread() {
  await threadsStore.archiveThread(props.thread.threadId)
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

      <!-- Archive action -->
      <div class="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          class="flex h-7 items-center gap-1 rounded border border-ctp-surface1 px-2 text-xs text-ctp-subtext1 hover:border-ctp-mauve hover:text-ctp-mauve"
          title="Archive"
          @click.prevent="archiveThread"
        >
          <svg class="h-3 w-3" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M1.5 2h13l-1 2H2.5L1.5 2zm.5 3h12v9a1 1 0 01-1 1H3a1 1 0 01-1-1V5zm4 2v5h5V7H6z"/>
          </svg>
        </button>
      </div>
    </div>
  </div>
</template>

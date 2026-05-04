<script setup lang="ts">
import { ref } from 'vue'
import type { Signal } from '@/types/server'

const props = defineProps<{ signal: Signal }>()

const body = ref('')
const subject = computed(() => `Re: ${props.signal.subject}`)

import { computed } from 'vue'
</script>

<template>
  <div class="rounded-lg border border-ctp-surface1 bg-ctp-mantle p-4">
    <h3 class="mb-3 text-sm font-medium text-ctp-text">Reply</h3>

    <div class="mb-2 text-xs text-ctp-subtext0">
      <span class="font-medium">To:</span> {{ signal.from.address }}
    </div>
    <div class="mb-3 text-xs text-ctp-subtext0">
      <span class="font-medium">Subject:</span> {{ subject }}
    </div>

    <textarea
      v-model="body"
      rows="6"
      placeholder="Write your reply…"
      class="w-full rounded border border-ctp-surface1 bg-ctp-base px-3 py-2 text-sm text-ctp-text placeholder-ctp-subtext0 focus:border-ctp-blue focus:outline-none"
    />

    <div class="mt-3 flex items-center justify-between">
      <span class="text-xs text-ctp-subtext0">Reply API not yet available</span>
      <button
        disabled
        class="cursor-not-allowed rounded bg-ctp-surface1 px-4 py-1.5 text-sm text-ctp-subtext0"
      >
        Send
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ConversationData } from '@/types/server'

defineProps<{ data: ConversationData }>()

const sentimentLabel: Record<ConversationData['sentiment'], string> = {
  positive: 'Positive',
  neutral: 'Neutral',
  negative: 'Negative',
  urgent: 'Urgent',
}

const sentimentClass: Record<ConversationData['sentiment'], string> = {
  positive: 'text-ctp-green',
  neutral: 'text-ctp-subtext0',
  negative: 'text-ctp-red',
  urgent: 'text-ctp-peach',
}
</script>

<template>
  <div class="rounded-lg border border-ctp-surface1 bg-ctp-mantle p-4">
    <div class="flex flex-wrap items-center gap-3">
      <div v-if="data.senderName" class="text-sm font-medium text-ctp-text">
        {{ data.senderName }}
      </div>

      <span
        v-if="data.requiresReply"
        class="rounded-full border border-ctp-peach px-2 py-0.5 text-xs text-ctp-peach"
      >
        Reply needed
      </span>

      <span v-if="data.isReply" class="text-xs text-ctp-subtext0">↩ Reply</span>

      <span v-if="data.threadLength && data.threadLength > 1" class="text-xs text-ctp-subtext0">
        {{ data.threadLength }} messages
      </span>

      <span class="text-xs" :class="sentimentClass[data.sentiment]">
        {{ sentimentLabel[data.sentiment] }}
      </span>
    </div>
  </div>
</template>

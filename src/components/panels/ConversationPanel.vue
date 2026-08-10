<script setup lang="ts">
import type { ConversationData } from '@/types/server'

defineProps<{ data: ConversationData; compact?: boolean }>()
</script>

<template>
  <!-- Compact: single row for inbox thread list -->
  <div v-if="compact" class="flex items-center gap-2 text-xs">
    <span class="shrink-0 text-ctp-subtext0">💬</span>
    <span v-if="data.requiresReply" class="shrink-0 text-ctp-peach">Reply needed</span>
  </div>

  <!-- Full: detail view card -->
  <div v-else class="rounded-lg border border-ctp-surface1 bg-ctp-mantle p-4">
    <div class="flex flex-wrap items-center gap-3">
      <span
        v-if="data.requiresReply"
        class="rounded-full border border-ctp-peach px-2 py-0.5 text-xs text-ctp-peach"
      >
        Reply needed
      </span>
    </div>
  </div>
</template>

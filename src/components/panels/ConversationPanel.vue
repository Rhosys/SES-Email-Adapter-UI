<script setup lang="ts">
import type { ConversationData } from '@/types/server'

defineProps<{ data: ConversationData }>()
</script>

<template>
  <div class="rounded-lg border border-ctp-surface1 bg-ctp-mantle p-4">
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

<script setup lang="ts">
import AsyncButton from '@/components/ui/AsyncButton.vue'

defineProps<{ action: () => Promise<unknown> }>()
</script>

<template>
  <div class="flex items-center justify-between gap-3 rounded-lg border border-ctp-surface1 bg-ctp-mantle px-4 py-3">
    <div>
      <p class="text-sm font-medium text-ctp-text">Don't want emails like this?</p>
      <p class="text-xs text-ctp-subtext0">This sender supports one-click unsubscribe.</p>
    </div>
    <AsyncButton
      :action="action"
      class="flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-ctp-surface1 px-3 text-sm text-ctp-subtext1 hover:border-ctp-peach hover:text-ctp-peach"
    >
      <svg class="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
        <path d="M8 1a7 7 0 100 14A7 7 0 008 1zM4.5 7.5h7v1h-7v-1z"/>
      </svg>
      Unsubscribe
    </AsyncButton>
  </div>
</template>

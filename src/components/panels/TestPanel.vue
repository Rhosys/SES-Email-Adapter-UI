<script setup lang="ts">
import type { TestData } from '@/types/server'

defineProps<{ data: TestData }>()
</script>

<template>
  <div class="rounded-lg border border-ctp-teal/30 bg-ctp-teal/5 p-4">
    <div class="flex items-center gap-2">
      <span class="rounded bg-ctp-surface1 px-2 py-0.5 font-mono text-xs text-ctp-subtext0">
        TEST
      </span>
      <span class="text-xs text-ctp-subtext0">
        {{ data.triggeredBy === 'system' ? 'Sent by system (onboarding)' : 'Sent by you' }}
      </span>
    </div>
    <p class="mt-2 text-sm text-ctp-subtext1">
      This is a test email confirming your inbox is working correctly.
    </p>
  </div>
</template>

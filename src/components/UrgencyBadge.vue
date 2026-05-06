<script setup lang="ts">
import type { ArcUrgency } from '@/types/server'

defineProps<{ urgency?: ArcUrgency }>()
</script>

<template>
  <span
    v-if="urgency === 'critical'"
    class="rounded-full bg-ctp-red px-2 py-0.5 text-xs font-bold text-ctp-base"
    aria-label="Critical urgency"
    >!</span
  >
  <span
    v-else-if="urgency === 'high'"
    class="rounded-full bg-ctp-peach px-2 py-0.5 text-xs font-bold text-ctp-base"
    aria-label="High urgency"
    >!</span
  >
</template>

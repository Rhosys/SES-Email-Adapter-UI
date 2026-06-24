<script setup lang="ts">
/**
 * UrgencyBadge — renders a colored "!" pill for critical/high urgency.
 * Only renders for urgencies that have a visual indicator. Normal/low/silent show nothing.
 *
 * ENUM PROP RULE: Every value of ArcUrgency must be listed here.
 * To add a new urgency level, add it to the type AND decide whether it renders.
 */

type ArcUrgency = 'critical' | 'high' | 'normal' | 'low' | 'silent'

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
  <!-- normal, low, silent: intentionally no visual indicator -->
</template>

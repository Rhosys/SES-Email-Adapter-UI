<script setup lang="ts">
import { computed } from 'vue';
import type { ArcUrgency } from '@/types/server';

const props = defineProps<{ urgency: ArcUrgency }>();

// Per spec (TODO.md "Global UX Notes"):
//   critical = red, high = amber, normal = no accent, low = grey, silent = never shown.
const colorClass = computed<string | null>(() => {
  switch (props.urgency) {
    case 'critical': return 'text-red';
    case 'high':     return 'text-peach';   // peach is the closest Catppuccin amber
    case 'normal':   return null;            // no accent — inherits surrounding text color
    case 'low':      return 'text-overlay0'; // grey
    case 'silent':   return null;            // never shown
  }
});

const label = computed(() => `${props.urgency} urgency`);
</script>

<template>
  <span
    v-if="urgency !== 'silent'"
    data-testid="urgency-badge"
    :data-urgency="urgency"
    :aria-label="label"
    class="inline-flex items-center gap-1 text-xs font-semibold uppercase"
    :class="colorClass"
  >
    <span class="h-2 w-2 rounded-full bg-current" aria-hidden="true" />
    {{ urgency }}
  </span>
</template>

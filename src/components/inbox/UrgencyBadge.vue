<script setup lang="ts">
import { computed } from 'vue';
import type { Urgency } from '@/types/server';

const props = defineProps<{ urgency: Urgency }>();

// Urgency → Catppuccin color token. Tokens (not raw hex) are used so the
// rendered color tracks whichever flavor is active.
const colorClass = computed<string>(() => {
  switch (props.urgency) {
    case 'critical': return 'text-red';
    case 'high': return 'text-mauve';
    case 'normal': return 'text-blue';
    case 'low': return 'text-subtext0';
  }
});

const label = computed(() => `${props.urgency} urgency`);
</script>

<template>
  <span
    data-testid="urgency-badge"
    :aria-label="label"
    class="inline-flex items-center gap-1 text-xs font-semibold uppercase"
    :class="colorClass"
  >
    <span class="h-2 w-2 rounded-full bg-current" aria-hidden="true" />
    {{ urgency }}
  </span>
</template>

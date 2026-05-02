<script setup lang="ts">
import type { Workflow } from '@/types/server';

defineProps<{ workflow: Workflow }>();

const GLYPHS: Record<Workflow, string> = {
  support: '✉',
  sales: '★',
  billing: '¤',
  quote: '§',
  invoice: '▤',
  shipping: '▣',
  other: '○'
};
</script>

<template>
  <span
    class="inline-flex h-6 w-6 items-center justify-center rounded bg-surface0 text-subtext1"
    :aria-label="`${workflow} workflow`"
  >
    {{ GLYPHS[workflow] }}
  </span>
</template>

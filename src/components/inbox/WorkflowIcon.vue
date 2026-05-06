<script setup lang="ts">
import type { Workflow } from '@/types/server';

defineProps<{ workflow: Workflow }>();

// One distinct glyph per workflow. Icons are placeholder unicode; phase 3 will
// swap these for proper SVGs.
const GLYPHS: Record<Workflow, string> = {
  auth: '🔑',
  conversation: '💬',
  crm: '🤝',
  package: '📦',
  travel: '✈',
  scheduling: '📅',
  payments: '💳',
  alert: '⚠',
  content: '📰',
  status: '📋',
  healthcare: '⚕',
  job: '💼',
  support: '🛠',
  test: '🧪'
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

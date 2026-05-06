<script setup lang="ts">
import type { Signal } from '@/types/server';

defineProps<{ signal: Signal }>();
</script>

<template>
  <article class="rounded-md border border-surface0 bg-mantle p-4">
    <header class="mb-2 flex items-center justify-between text-xs text-subtext0">
      <span>{{ signal.from.name ? `${signal.from.name} <${signal.from.address}>` : signal.from.address }}</span>
      <time>{{ signal.receivedAt }}</time>
    </header>
    <h3 class="mb-2 text-sm font-medium text-text">{{ signal.subject }}</h3>
    <p class="text-sm text-subtext1">{{ signal.summary }}</p>
    <pre v-if="signal.textBody" class="mt-2 whitespace-pre-wrap text-sm text-text">{{ signal.textBody }}</pre>
  </article>
</template>

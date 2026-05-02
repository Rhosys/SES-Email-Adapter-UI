<script setup lang="ts">
import type { Pong } from '@/types/server';

defineProps<{ pong: Pong }>();
</script>

<template>
  <article class="rounded-md border border-mauve bg-mantle p-4">
    <header class="mb-2 text-xs uppercase tracking-wide text-mauve">
      Pong reply {{ pong.draft ? '(draft)' : '' }}
    </header>
    <pre class="whitespace-pre-wrap text-sm text-text">{{ pong.bodyMarkdown }}</pre>
  </article>
</template>

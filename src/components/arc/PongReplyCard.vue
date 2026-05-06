<script setup lang="ts">
import type { Signal } from '@/types/server';

// On a `workflow: "test"` arc the platform auto-replies; that reply is itself
// a Signal with source = "system" or "user" depending on origin. The card
// renders that reply with playful framing per the spec ("We replied →").
defineProps<{ reply: Signal }>();
</script>

<template>
  <article class="rounded-md border border-mauve bg-mantle p-4">
    <header class="mb-2 text-xs uppercase tracking-wide text-mauve">
      We replied →
    </header>
    <p class="text-sm text-subtext1">{{ reply.subject }}</p>
    <pre v-if="reply.textBody" class="mt-2 whitespace-pre-wrap text-sm text-text">{{ reply.textBody }}</pre>
  </article>
</template>

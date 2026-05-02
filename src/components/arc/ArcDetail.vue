<script setup lang="ts">
import { computed } from 'vue';
import type { Arc, Signal } from '@/types/server';
import SignalCard from './SignalCard.vue';
import PongReplyCard from './PongReplyCard.vue';

const props = defineProps<{ arc: Arc; signals: Signal[] }>();

// On a test workflow arc the system auto-reply is a signal whose source is not
// "email". Surface those as pong cards; everything else as a normal signal.
const replies = computed(() =>
  props.arc.workflow === 'test'
    ? props.signals.filter((s) => s.source !== 'email')
    : []
);
const inbound = computed(() => props.signals.filter((s) => !replies.value.includes(s)));
</script>

<template>
  <section class="flex flex-col gap-3 p-4">
    <header>
      <h1 class="text-lg font-semibold text-text">{{ arc.summary }}</h1>
      <p class="text-xs text-subtext0">workflow: {{ arc.workflow }}</p>
    </header>
    <SignalCard v-for="s in inbound" :key="s.id" :signal="s" />
    <PongReplyCard v-for="r in replies" :key="r.id" :reply="r" />
  </section>
</template>

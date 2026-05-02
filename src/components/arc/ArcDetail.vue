<script setup lang="ts">
import type { Arc, Signal, Pong } from '@/types/server';
import SignalCard from './SignalCard.vue';
import PongReplyCard from './PongReplyCard.vue';

defineProps<{ arc: Arc; signals: Signal[]; pongs: Pong[] }>();
</script>

<template>
  <section class="flex flex-col gap-3 p-4">
    <header>
      <h1 class="text-lg font-semibold text-text">{{ arc.subject }}</h1>
      <p class="text-xs text-subtext0">{{ arc.signalCount }} signals</p>
    </header>
    <SignalCard v-for="s in signals" :key="s.id" :signal="s" />
    <PongReplyCard v-for="p in pongs" :key="p.id" :pong="p" />
  </section>
</template>

<script setup lang="ts">
import type { Arc } from '@/types/server';
import UrgencyBadge from './UrgencyBadge.vue';
import WorkflowIcon from './WorkflowIcon.vue';

defineProps<{ arc: Arc }>();
</script>

<template>
  <RouterLink
    :to="`/arcs/${arc.id}`"
    class="flex items-center gap-3 border-b border-surface0 px-4 py-3 hover:bg-surface0"
  >
    <WorkflowIcon :workflow="arc.workflow" />
    <div class="min-w-0 flex-1">
      <div class="flex items-center gap-2">
        <span class="truncate text-sm text-text">{{ arc.summary }}</span>
        <UrgencyBadge v-if="arc.urgency" :urgency="arc.urgency" />
      </div>
      <p v-if="arc.labels.length" class="mt-1 truncate text-xs text-subtext0">
        <!-- Labels are stored as IDs on the arc; the inbox will resolve them to
             names + colors against the labels store in phase 6. -->
        <span v-for="id in arc.labels" :key="id" class="mr-1">#{{ id }}</span>
      </p>
    </div>
    <time class="shrink-0 text-xs text-subtext0">{{ arc.lastSignalAt }}</time>
  </RouterLink>
</template>

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
        <span class="truncate text-sm font-medium text-text">{{ arc.subject }}</span>
        <UrgencyBadge :urgency="arc.urgency" />
      </div>
      <p class="truncate text-xs text-subtext0">{{ arc.preview }}</p>
    </div>
    <time class="shrink-0 text-xs text-subtext0">{{ arc.lastSignalAt }}</time>
  </RouterLink>
</template>

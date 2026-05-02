<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useArcs } from '@/composables/useArcs';

const route = useRoute();
const { byId } = useArcs();
const arc = computed(() => byId(route.params.id as string));
</script>

<template>
  <div class="p-4">
    <p v-if="!arc" class="text-sm text-subtext0">
      Arc {{ route.params.id }} not loaded yet. (Phase 4 will fetch on mount.)
    </p>
    <div v-else>
      <h1 class="text-lg font-semibold text-text">{{ arc.subject }}</h1>
    </div>
  </div>
</template>

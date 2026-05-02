<script setup lang="ts">
import { onMounted } from 'vue';
import { useArcs } from '@/composables/useArcs';
import ArcRow from './ArcRow.vue';

const { items, loading, error, exhausted, loadNextPage } = useArcs();

onMounted(loadNextPage);
</script>

<template>
  <div class="flex flex-col">
    <ArcRow v-for="arc in items" :key="arc.id" :arc="arc" />
    <div v-if="loading" class="px-4 py-3 text-sm text-subtext0">Loading…</div>
    <div v-else-if="error" class="px-4 py-3 text-sm text-red">{{ error }}</div>
    <div v-else-if="!items.length" class="px-4 py-8 text-center text-sm text-subtext0">
      Nothing in your inbox.
    </div>
    <button
      v-if="!exhausted && items.length"
      class="px-4 py-3 text-center text-sm text-mauve hover:bg-surface0"
      @click="loadNextPage"
    >
      Load more
    </button>
  </div>
</template>

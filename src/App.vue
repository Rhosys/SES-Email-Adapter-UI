<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import AppShell from '@/components/layout/AppShell.vue';

const route = useRoute();
const minimal = computed(() => route.meta.layout === 'minimal');
</script>

<template>
  <RouterView v-if="minimal" />
  <AppShell v-else />
</template>

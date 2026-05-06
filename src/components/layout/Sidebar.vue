<script setup lang="ts">
import { RouterLink } from 'vue-router';

const items = [
  { to: '/', label: 'Inbox' },
  { to: '/quarantine', label: 'Quarantine' },
  { to: '/search', label: 'Search' },
  { to: '/settings', label: 'Settings' }
];
</script>

<template>
  <nav class="flex h-full flex-col gap-1 p-3" aria-label="Primary">
    <div class="px-2 py-3 text-sm font-semibold uppercase tracking-wide text-subtext0">
      SES Adapter
    </div>
    <RouterLink
      v-for="item in items"
      :key="item.to"
      :to="item.to"
      class="rounded-md px-3 py-2 text-sm text-text hover:bg-surface0"
      active-class="bg-surface0 text-mauve"
    >
      {{ item.label }}
    </RouterLink>
  </nav>
</template>

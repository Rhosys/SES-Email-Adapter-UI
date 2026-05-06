<script setup lang="ts">
import Sidebar from './Sidebar.vue';
import TopBar from './TopBar.vue';
</script>

<template>
  <div class="flex h-full bg-base text-text">
    <Sidebar class="w-64 shrink-0 border-r border-surface0 bg-mantle" />
    <div class="flex min-w-0 flex-1 flex-col">
      <TopBar class="h-14 shrink-0 border-b border-surface0 bg-mantle" />
      <main class="min-h-0 flex-1 overflow-auto">
        <RouterView />
      </main>
    </div>
  </div>
</template>

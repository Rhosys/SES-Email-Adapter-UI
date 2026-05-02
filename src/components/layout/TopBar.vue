<script setup lang="ts">
import { useTheme } from '@/composables/useTheme';
import type { Flavor } from '@/themes/catppuccin';

const { flavor, flavors, setFlavor } = useTheme();
</script>

<template>
  <header class="flex items-center justify-between px-4">
    <div class="text-sm text-subtext0">SES Email Adapter</div>
    <label class="flex items-center gap-2 text-sm">
      <span class="text-subtext0">Theme</span>
      <select
        :value="flavor"
        class="rounded-md border border-surface0 bg-base px-2 py-1 text-text"
        @change="setFlavor(($event.target as HTMLSelectElement).value as Flavor)"
      >
        <option v-for="f in flavors" :key="f" :value="f">{{ f }}</option>
      </select>
    </label>
  </header>
</template>

<script setup lang="ts">
defineProps<{ tone?: 'neutral' | 'info' | 'warn' | 'danger' }>();
</script>

<template>
  <span
    class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
    :class="{
      'bg-surface0 text-subtext1': !tone || tone === 'neutral',
      'bg-surface0 text-blue': tone === 'info',
      'bg-surface0 text-yellow': tone === 'warn',
      'bg-surface0 text-red': tone === 'danger'
    }"
  >
    <slot />
  </span>
</template>

<script setup lang="ts">
defineProps<{ label: string }>()
</script>

<template>
  <span class="rounded-full bg-ctp-surface1 px-2 py-0.5 text-xs text-ctp-subtext1">{{
    label
  }}</span>
</template>

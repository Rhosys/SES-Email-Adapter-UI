<script setup lang="ts">
defineProps<{ message: string }>()
</script>

<template>
  <div class="mb-4 rounded border border-ctp-red bg-ctp-surface0 px-4 py-3 text-sm text-ctp-red">
    {{ message }}
  </div>
</template>

<script setup lang="ts">
</script>

<template>
  <div role="table" aria-label="Arc list">
    <!-- Rows injected via slot -->
    <TransitionGroup name="list" tag="div" class="relative">
      <slot />
    </TransitionGroup>
  </div>
</template>

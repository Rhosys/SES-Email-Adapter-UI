<script setup lang="ts">
defineProps<{ tab: 'active' | 'archived' | 'all' }>()

const messages = {
  active: 'Your inbox is empty',
  archived: 'Nothing archived',
  all: 'No arcs yet',
}
</script>

<template>
  <div class="py-20 text-center text-ctp-subtext0">
    <p class="text-base">{{ messages[tab] }}</p>
  </div>
</template>

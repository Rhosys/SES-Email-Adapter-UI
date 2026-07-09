<script setup lang="ts">
withDefaults(defineProps<{
  picture: string | null
  initials: string
  displayName?: string | null
  textSize?: string
}>(), { displayName: null, textSize: 'text-xs' })
</script>

<template>
  <img
    v-if="picture"
    :src="picture"
    :alt="displayName ?? 'Profile'"
    class="h-full w-full object-cover"
    referrerpolicy="no-referrer"
  />
  <span
    v-else
    class="flex h-full w-full items-center justify-center bg-ctp-surface1 font-semibold text-ctp-subtext1"
    :class="textSize"
  >
    {{ initials }}
  </span>
</template>

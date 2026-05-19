<script setup lang="ts">
import { useRouter } from 'vue-router'
const router = useRouter()
</script>

<template>
  <div class="flex min-h-screen flex-col items-center justify-center bg-ctp-base text-ctp-text">
    <p class="text-6xl font-bold text-ctp-surface2">404</p>
    <p class="mt-4 text-lg font-medium">Page not found</p>
    <p class="mt-1 text-sm text-ctp-subtext0">The page you're looking for doesn't exist.</p>
    <button
      class="mt-6 rounded-lg bg-ctp-mauve px-4 py-2 text-sm font-medium text-ctp-base hover:opacity-90"
      @click="router.push('/')"
    >
      Go to inbox
    </button>
  </div>
</template>

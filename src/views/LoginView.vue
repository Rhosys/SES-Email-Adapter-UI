<script setup lang="ts">
import { onMounted } from 'vue'
import { loginClient } from '@/lib/auth'

onMounted(async () => {
  await loginClient.authenticate()
})
</script>

<template>
  <div class="flex h-screen items-center justify-center bg-ctp-base">
    <p class="text-ctp-subtext0">Redirecting to login…</p>
  </div>
</template>

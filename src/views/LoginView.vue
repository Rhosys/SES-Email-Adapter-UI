<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { loginClient } from '@/lib/auth'

const router = useRouter()

onMounted(async () => {
  // Process any OAuth callback params in the URL first.
  // If a session exists (or was just established from the redirect), go to the app.
  const hasSession = await loginClient.userSessionExists()
  if (hasSession) {
    void router.replace('/')
    return
  }
  // Redirect to Authress, returning to the app root (not /login) after success.
  await loginClient.authenticate({ redirectUrl: `${window.location.origin}/` })
})
</script>

<template>
  <div class="flex h-screen items-center justify-center bg-ctp-base">
    <p class="text-ctp-subtext0">Redirecting to login…</p>
  </div>
</template>

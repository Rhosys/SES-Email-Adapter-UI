<script setup lang="ts">
import { onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { loginClient } from '@/lib/auth'

const route = useRoute()
const router = useRouter()

onMounted(async () => {
  // Validate the redirect param — must be an internal path (starts with /) to prevent open redirect.
  const raw = route.query.redirect as string | undefined
  const destination = raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/'

  // Process any OAuth callback params in the URL first.
  // If a session exists (or was just established from the redirect), go to the app.
  const hasSession = await loginClient.userSessionExists()
  if (hasSession) {
    void router.replace(destination)
    return
  }
  // Redirect to Authress. Use the current URL (which already contains ?redirect=...) as the
  // OAuth callback so Authress returns here and LoginView handles the final navigation.
  await loginClient.authenticate({ redirectUrl: window.location.href })
})
</script>

<template>
  <div class="flex h-screen items-center justify-center bg-ctp-base">
    <p class="text-ctp-subtext0">Redirecting to login…</p>
  </div>
</template>

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
  <div class="flex h-dvh items-center justify-center bg-ctp-base">
    <div class="flex flex-col items-center gap-4">
      <div class="flex items-center gap-2">
        <svg viewBox="0 0 32 32" fill="none" class="h-8 w-8" aria-hidden="true">
          <path d="M6 10h20v12H6z" stroke="currentColor" stroke-width="2" class="text-ctp-mauve" />
          <path d="M6 10l10 7 10-7" stroke="currentColor" stroke-width="2" stroke-linejoin="round" class="text-ctp-mauve" />
        </svg>
        <span class="text-lg font-medium text-ctp-text">Numaeel</span>
      </div>
      <div class="h-1 w-32 overflow-hidden rounded-full bg-ctp-surface0">
        <div class="login-loading-bar h-full rounded-full bg-ctp-mauve" />
      </div>
    </div>
  </div>
</template>

<style scoped>
@keyframes loading-slide {
  0% { width: 0%; transform: translateX(0); }
  50% { width: 60%; transform: translateX(20%); }
  100% { width: 30%; transform: translateX(300%); }
}
.login-loading-bar {
  animation: loading-slide 1.5s ease-in-out infinite;
}
</style>

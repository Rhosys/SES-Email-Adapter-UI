<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { loginClient } from '@/lib/auth'

const router = useRouter()

const state = ref<'loading' | 'error'>('loading')
const errorMessage = ref('')

function categorizeError(description: string | null): string {
  if (!description) return 'This invite link is invalid.'
  const d = description.toLowerCase()
  if (d.includes('expired')) return 'This invite has expired.'
  if (d.includes('already')) return 'This invite has already been used.'
  if (d.includes('not found')) return 'This invite could not be found.'
  return 'This invite link is invalid.'
}

onMounted(async () => {
  const params = new URLSearchParams(window.location.search)
  const inviteId = params.get('inviteId')
  const oauthError = params.get('error')
  const oauthErrorDescription = params.get('error_description')

  // OAuth failure return — show error immediately
  if (oauthError) {
    state.value = 'error'
    errorMessage.value = categorizeError(oauthErrorDescription)
    return
  }

  // Missing invite ID
  if (!inviteId) {
    state.value = 'error'
    errorMessage.value = 'This invite link is invalid — no invite ID was found.'
    return
  }

  // Check for existing session (also processes any OAuth callback tokens)
  let hasSession = false
  try {
    hasSession = await loginClient.userSessionExists()
  } catch {
    // network error — fall through to authenticate
  }

  if (hasSession) {
    await router.replace('/')
    return
  }

  // Kick off the Authress invite-acceptance login flow
  try {
    await loginClient.authenticate({
      inviteId,
      redirectUrl: window.location.href,
    })
    // authenticate() redirects — code below only runs if it returns without redirecting
  } catch (err: unknown) {
    const status = (err as { status?: number; statusCode?: number })?.status ??
      (err as { status?: number; statusCode?: number })?.statusCode
    if (status === 404) {
      errorMessage.value = 'This invite could not be found.'
    } else if (status === 410) {
      errorMessage.value = 'This invite has expired.'
    } else if (status === 409) {
      errorMessage.value = 'This invite has already been used.'
    } else {
      errorMessage.value = 'This invite link is invalid.'
    }
    state.value = 'error'
  }
})
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-ctp-base px-4">
    <div class="w-full max-w-sm rounded-xl border border-ctp-surface1 bg-ctp-mantle p-8 text-center shadow-lg">
      <!-- Logo / wordmark -->
      <div class="mb-6 flex justify-center">
        <span class="text-lg font-semibold text-ctp-text">SES Email Adapter</span>
      </div>

      <!-- Loading -->
      <template v-if="state === 'loading'">
        <div class="mb-4 flex justify-center" role="status" aria-label="Processing invitation…">
          <svg
            class="h-8 w-8 animate-spin text-ctp-mauve"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
            <path
              class="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
        </div>
        <p class="text-sm text-ctp-subtext0">Accepting your invitation…</p>
      </template>

      <!-- Error -->
      <template v-else>
        <div
          class="mb-4 flex justify-center text-ctp-red"
          aria-live="polite"
        >
          <svg class="h-10 w-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <path stroke-linecap="round" d="M12 8v4m0 4h.01" />
          </svg>
        </div>
        <h1 class="mb-2 text-base font-semibold text-ctp-text">Invite link problem</h1>
        <p class="text-sm text-ctp-subtext0">{{ errorMessage }}</p>
        <p class="mt-3 text-xs text-ctp-subtext0">
          Ask the person who invited you to send a new invitation link.
        </p>
        <a
          href="/"
          class="mt-6 inline-block text-sm text-ctp-mauve hover:underline"
        >
          Go to sign in
        </a>
      </template>
    </div>
  </div>
</template>

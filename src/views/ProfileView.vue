<script setup lang="ts">
import { useAccountStore } from '@/stores/account'
import { loginClient } from '@/lib/auth'

const accountStore = useAccountStore()

async function signOut() {
  await loginClient.logout()
}
</script>

<template>
  <div>
    <header class="border-b border-ctp-surface0 bg-ctp-mantle px-4 py-3">
      <h1 class="text-lg font-semibold">Profile</h1>
    </header>

    <main class="mx-auto max-w-lg px-4 py-6 space-y-6">
      <div class="rounded-lg border border-ctp-surface1 p-4 space-y-3">
        <div>
          <p class="text-xs text-ctp-subtext0">Account</p>
          <p class="text-sm font-medium text-ctp-text">{{ accountStore.account?.name ?? '—' }}</p>
        </div>
        <div>
          <p class="text-xs text-ctp-subtext0">Account ID</p>
          <p class="font-mono text-xs text-ctp-subtext1">{{ accountStore.accountId ?? '—' }}</p>
        </div>
      </div>

      <div class="rounded-lg border border-ctp-surface1 p-4">
        <h2 class="mb-3 text-sm font-medium text-ctp-subtext1">Session</h2>
        <button
          class="rounded-lg border border-ctp-red px-4 py-2 text-sm text-ctp-red hover:bg-ctp-red/10"
          @click="signOut"
        >
          Sign out
        </button>
      </div>
    </main>
  </div>
</template>

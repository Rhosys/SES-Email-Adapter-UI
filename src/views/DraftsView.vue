<script setup lang="ts">
import { onMounted } from 'vue'
import { useAccountStore } from '@/stores/account'

const accountStore = useAccountStore()

onMounted(async () => {
  if (!accountStore.accountId) await accountStore.fetchAccount()
})
</script>

<template>
  <div>
    <header class="border-b border-ctp-surface0 bg-ctp-mantle px-4 py-3">
      <h1 class="text-lg font-semibold">Drafts</h1>
    </header>
    <main class="mx-auto max-w-3xl px-4 py-6">
      <div class="py-20 text-center">
        <p class="text-base font-medium text-ctp-text">No drafts</p>
        <p class="mx-auto mt-2 max-w-sm text-sm text-ctp-subtext0">
          When you start composing a reply but don't send it, it'll appear here.
        </p>
      </div>
    </main>
  </div>
</template>

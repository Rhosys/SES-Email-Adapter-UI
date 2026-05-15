<script setup lang="ts">
import { useAccountStore } from '@/stores/account'
import { api } from '@/lib/api'
import { ref, onMounted } from 'vue'
import type { Account } from '@/types/server'

const accountStore = useAccountStore()
const account = ref<Account | null>(null)
const loading = ref(false)

const portalUrl = import.meta.env.VITE_BILLING_PORTAL_URL as string | undefined

onMounted(async () => {
  if (!accountStore.accountId) await accountStore.fetchAccount()
  loading.value = true
  if (!accountStore.accountId) return
  const result = await api.getAccount(accountStore.accountId)
  loading.value = false
  if (result.isOk()) account.value = result.value
})

function openPortal() {
  if (portalUrl) window.open(portalUrl, '_blank', 'noopener,noreferrer')
}
</script>

<template>
  <div>
    <header class="border-b border-ctp-surface0 bg-ctp-mantle px-4 py-3">
      <h1 class="text-lg font-semibold">Billing</h1>
      <p class="mt-0.5 text-xs text-ctp-subtext0">Manage your plan and payment details</p>
    </header>

    <main class="mx-auto max-w-lg space-y-4 px-4 py-6">
      <div v-if="loading" class="py-12 text-center text-sm text-ctp-subtext0">Loading…</div>

      <template v-else>
        <!-- Current plan -->
        <div class="rounded-lg border border-ctp-surface1 p-4">
          <p class="text-xs text-ctp-subtext0">Account</p>
          <p class="mt-1 text-sm font-semibold text-ctp-text">{{ account?.name ?? '—' }}</p>
          <p class="text-xs text-ctp-subtext0">ID: {{ accountStore.accountId }}</p>
        </div>

        <!-- Portal link -->
        <template v-if="portalUrl">
          <p class="text-xs text-ctp-subtext0">
            To update payment methods or download invoices, use the billing portal.
          </p>
          <button
            class="rounded-lg bg-ctp-mauve px-4 py-2 text-sm font-medium text-ctp-base hover:opacity-90"
            @click="openPortal"
          >
            Open billing portal ↗
          </button>
        </template>
        <div
          v-else
          class="rounded-lg border border-dashed border-ctp-surface1 px-4 py-8 text-center text-sm text-ctp-subtext0"
        >
          Billing portal not configured. Set
          <code class="font-mono text-xs">VITE_BILLING_PORTAL_URL</code> to enable.
        </div>
      </template>
    </main>
  </div>
</template>

<script setup lang="ts">
import BillingPanel from '@/components/settings/BillingPanel.vue'
</script>

<template>
  <div>
    <header class="border-b border-ctp-surface0 bg-ctp-mantle px-4 py-3">
      <h1 class="hidden text-lg font-semibold sm:block">Billing</h1>
      <p class="mt-0.5 text-xs text-ctp-subtext0">Manage your plan and payment details</p>
    </header>

    <main class="px-4 py-6">
      <BillingPanel />
    </main>
  </div>
</template>

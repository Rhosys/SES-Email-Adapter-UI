<script setup lang="ts">
// Billing is managed via an external portal (e.g. Stripe). This view
// shows the plan summary and links out to the portal.
</script>

<template>
  <div>
    <header class="border-b border-ctp-surface0 bg-ctp-mantle px-4 py-3">
      <h1 class="text-lg font-semibold">Billing</h1>
      <p class="mt-0.5 text-xs text-ctp-subtext0">Manage your plan and payment details</p>
    </header>

    <main class="mx-auto max-w-lg px-4 py-6 space-y-4">
      <!-- Current plan -->
      <div class="rounded-lg border border-ctp-surface1 p-4">
        <p class="text-xs text-ctp-subtext0">Current plan</p>
        <p class="mt-1 text-sm font-semibold text-ctp-text">Pro</p>
        <p class="text-xs text-ctp-subtext0">Renews monthly</p>
      </div>

      <!-- Usage -->
      <div class="rounded-lg border border-ctp-surface1 p-4">
        <p class="mb-3 text-sm font-medium text-ctp-subtext1">This month</p>
        <div class="space-y-2">
          <div class="flex items-center justify-between text-sm">
            <span class="text-ctp-subtext0">Signals processed</span>
            <span class="font-medium text-ctp-text">—</span>
          </div>
          <div class="flex items-center justify-between text-sm">
            <span class="text-ctp-subtext0">Emails forwarded</span>
            <span class="font-medium text-ctp-text">—</span>
          </div>
        </div>
      </div>

      <!-- Portal link -->
      <p class="text-xs text-ctp-subtext0">
        To update payment methods or download invoices, use the billing portal.
      </p>
      <button
        class="rounded-lg bg-ctp-mauve px-4 py-2 text-sm font-medium text-ctp-base hover:opacity-90"
        @click="() => {}"
      >
        Open billing portal ↗
      </button>
    </main>
  </div>
</template>

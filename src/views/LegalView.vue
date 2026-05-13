<script setup lang="ts">
defineProps<{ page: 'terms' | 'privacy' }>()
</script>

<template>
  <div class="min-h-screen bg-ctp-base text-ctp-text">
    <header class="border-b border-ctp-surface0 bg-ctp-mantle px-4 py-3">
      <h1 class="text-lg font-semibold">
        {{ page === 'terms' ? 'Terms of Service' : 'Privacy Policy' }}
      </h1>
    </header>
    <main class="mx-auto max-w-2xl px-4 py-8 prose prose-sm text-ctp-text">
      <template v-if="page === 'terms'">
        <p class="text-ctp-subtext0 text-sm">Last updated: January 2025</p>
        <h2 class="text-ctp-subtext1 font-semibold mt-6 mb-2">1. Use of service</h2>
        <p class="text-ctp-subtext0 text-sm">
          SES Email Adapter provides email processing and filtering services. By using this service
          you agree to use it only for lawful purposes and in accordance with these terms.
        </p>
        <h2 class="text-ctp-subtext1 font-semibold mt-6 mb-2">2. Data retention</h2>
        <p class="text-ctp-subtext0 text-sm">
          Processed signals are retained for the period configured in your account settings (default
          90 days). You may reduce this at any time.
        </p>
        <h2 class="text-ctp-subtext1 font-semibold mt-6 mb-2">3. Liability</h2>
        <p class="text-ctp-subtext0 text-sm">
          The service is provided as-is without warranty. We are not liable for any loss of data or
          business resulting from filtering decisions made by the rules engine.
        </p>
      </template>
      <template v-else>
        <p class="text-ctp-subtext0 text-sm">Last updated: January 2025</p>
        <h2 class="text-ctp-subtext1 font-semibold mt-6 mb-2">What we collect</h2>
        <p class="text-ctp-subtext0 text-sm">
          We process email metadata (sender, subject, timestamps) and store signals for the
          configured retention period. Email bodies are processed in-memory and not stored unless
          explicitly enabled.
        </p>
        <h2 class="text-ctp-subtext1 font-semibold mt-6 mb-2">How we use it</h2>
        <p class="text-ctp-subtext0 text-sm">
          Signal data is used solely to power the filtering and categorisation features of this
          service. We do not sell or share your data with third parties.
        </p>
        <h2 class="text-ctp-subtext1 font-semibold mt-6 mb-2">Your rights</h2>
        <p class="text-ctp-subtext0 text-sm">
          You may request deletion of your account and all associated data at any time via the
          settings page or by contacting support.
        </p>
      </template>
    </main>
  </div>
</template>

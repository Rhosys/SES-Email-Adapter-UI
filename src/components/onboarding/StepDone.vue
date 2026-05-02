<script setup lang="ts">
import { RouterLink } from 'vue-router';
import { useOnboardingStore } from '@/stores/onboarding';

const store = useOnboardingStore();
</script>

<template>
  <section class="flex flex-col gap-4">
    <header>
      <h2 class="text-xl font-semibold text-text">You’re ready</h2>
      <p class="text-sm text-subtext0">Quick recap of your setup:</p>
    </header>
    <dl class="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm" data-testid="recap">
      <dt class="text-subtext0">Domain</dt>
      <dd class="text-text">{{ store.domain }}</dd>
      <dt class="text-subtext0">Receiving</dt>
      <dd class="text-text">{{ store.receivingVerified ? 'verified' : 'pending' }}</dd>
      <dt class="text-subtext0">Sending</dt>
      <dd class="text-text">{{ store.sendingVerified ? 'verified' : 'pending' }}</dd>
      <dt class="text-subtext0">Filter mode</dt>
      <dd class="text-text">{{ store.filterMode }}</dd>
    </dl>
    <RouterLink
      to="/"
      data-testid="go-to-inbox"
      class="self-start inline-flex items-center justify-center rounded-md bg-mauve px-3 py-1.5 text-sm font-medium text-base hover:opacity-90"
    >
      Go to my inbox →
    </RouterLink>
  </section>
</template>

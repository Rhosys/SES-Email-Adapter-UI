<script setup lang="ts">
import { useOnboardingStore } from '@/stores/onboarding';
import DnsRecordTable from './DnsRecordTable.vue';

const store = useOnboardingStore();
</script>

<template>
  <section class="flex flex-col gap-4">
    <header>
      <h2 class="text-xl font-semibold text-text">Set up sending</h2>
      <p class="text-sm text-subtext0">
        These three records let you reply to emails and forward them to other
        addresses, and stop your replies landing in spam. They keep polling
        below — you can move on whenever you’re ready, or skip and finish later.
      </p>
    </header>

    <DnsRecordTable
      v-if="store.senderRecords.length"
      :records="store.senderRecords"
      title="Sender DNS records"
    />
    <p v-else class="text-sm text-subtext0">
      No DNS records yet — jump back to the domain step.
    </p>
  </section>
</template>

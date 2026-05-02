<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';
import { api } from '@/api/client';
import { useAccountStore } from '@/stores/account';
import { useOnboardingStore } from '@/stores/onboarding';
import Button from '@/components/ui/Button.vue';
import DnsRecordTable from './DnsRecordTable.vue';

const POLL_MS = 10_000; // per spec: poll DNS every 10 seconds

const account = useAccountStore();
const store = useOnboardingStore();
const domain = ref(store.domain);
const submitting = ref(false);
const error = ref<string | null>(null);
let timer: ReturnType<typeof setTimeout> | null = null;

function stopPolling() {
  if (timer) { clearTimeout(timer); timer = null; }
}

async function pollRecords() {
  if (!account.accountId || !store.domainId) return;
  try {
    const records = await api.domains.records(account.accountId, store.domainId);
    store.setDnsRecords(records);
    // Auto-advance once Tier 1 (MX) is verified, per spec.
    if (store.receivingVerified && store.step === 1) store.next();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'DNS check failed';
  } finally {
    timer = setTimeout(pollRecords, POLL_MS);
  }
}

async function register() {
  if (!domain.value || !account.accountId) return;
  submitting.value = true;
  error.value = null;
  try {
    const created = await api.domains.create(account.accountId, domain.value);
    store.setDomain(created.domain, created.id);
    const records = await api.domains.records(account.accountId, created.id);
    store.setDnsRecords(records);
    timer = setTimeout(pollRecords, POLL_MS);
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to register domain';
  } finally {
    submitting.value = false;
  }
}

onBeforeUnmount(stopPolling);
</script>

<template>
  <section class="flex flex-col gap-4">
    <header>
      <h2 class="text-xl font-semibold text-text">Register your domain</h2>
      <p class="text-sm text-subtext0">
        We’ll generate all 4 DNS records up front. The MX is required to receive
        email; the other three (DKIM, SPF, DMARC) enable replies and forwarding.
      </p>
    </header>

    <label class="flex flex-col gap-1 text-sm">
      <span class="text-subtext0">Domain</span>
      <input
        v-model="domain"
        type="text"
        placeholder="example.com"
        :disabled="!!store.domainId"
        class="rounded-md border border-surface0 bg-base px-3 py-2 text-text disabled:opacity-50"
      />
    </label>

    <div v-if="!store.domainId" class="flex items-center gap-2">
      <Button :disabled="submitting || !domain" @click="register">
        {{ submitting ? 'Registering…' : 'Generate DNS records' }}
      </Button>
      <span v-if="error" class="text-sm text-red">{{ error }}</span>
    </div>

    <DnsRecordTable
      v-if="store.dnsRecords.length"
      :records="store.dnsRecords"
      title="DNS records (MX = required, others = recommended)"
    />
  </section>
</template>

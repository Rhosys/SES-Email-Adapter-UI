<script setup lang="ts">
import { ref, computed } from 'vue';
import { api } from '@/api/client';
import { useOnboardingStore } from '@/stores/onboarding';
import Button from '@/components/ui/Button.vue';
import type { DnsRecord, DnsTier } from '@/types/server';

const store = useOnboardingStore();
const domain = ref(store.domain);
const loading = ref(false);
const error = ref<string | null>(null);

const groupedRecords = computed(() => {
  const apex: DnsRecord[] = [];
  const sub: DnsRecord[] = [];
  for (const r of store.dnsRecords) (r.tier === 'apex' ? apex : sub).push(r);
  return { apex, sub };
});

async function verify() {
  if (!domain.value) return;
  loading.value = true;
  error.value = null;
  try {
    const reg = await api.onboarding.registerDomain(domain.value);
    store.setDomain(reg.domain, reg.records);
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to register domain';
  } finally {
    loading.value = false;
  }
}

function tierLabel(t: DnsTier) {
  return t === 'apex' ? 'Apex records' : 'Subdomain records';
}
</script>

<template>
  <section class="flex flex-col gap-4">
    <header>
      <h2 class="text-xl font-semibold text-text">Add your sending domain</h2>
      <p class="text-sm text-subtext0">We’ll generate the DNS records you need to publish.</p>
    </header>

    <label class="flex flex-col gap-1 text-sm">
      <span class="text-subtext0">Domain</span>
      <input
        v-model="domain"
        type="text"
        placeholder="example.com"
        class="rounded-md border border-surface0 bg-base px-3 py-2 text-text"
      />
    </label>

    <div class="flex items-center gap-2">
      <Button :disabled="loading" @click="verify">
        {{ loading ? 'Verifying…' : 'Generate DNS records' }}
      </Button>
      <span v-if="error" class="text-sm text-red">{{ error }}</span>
    </div>

    <div v-if="store.dnsRecords.length" class="flex flex-col gap-3" data-testid="dns-records">
      <div
        v-for="tier in (['apex', 'sub'] as const)"
        :key="tier"
        class="rounded-md border border-surface0 bg-mantle p-3"
      >
        <h3 class="mb-2 text-xs font-semibold uppercase tracking-wide text-subtext0">
          {{ tierLabel(tier) }}
        </h3>
        <table class="w-full text-left text-sm">
          <thead class="text-xs uppercase text-subtext0">
            <tr><th class="py-1">Type</th><th>Name</th><th>Value</th><th>Purpose</th></tr>
          </thead>
          <tbody>
            <tr v-for="r in groupedRecords[tier]" :key="`${r.type}-${r.name}-${r.value}`">
              <td class="py-1 pr-2 font-mono text-mauve">{{ r.type }}</td>
              <td class="pr-2 font-mono">{{ r.name }}</td>
              <td class="truncate pr-2 font-mono">{{ r.value }}</td>
              <td class="text-subtext0">{{ r.purpose }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>

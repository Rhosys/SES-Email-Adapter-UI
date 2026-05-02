<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { api } from '@/api/client';
import { useAccountStore } from '@/stores/account';
import { useOnboardingStore } from '@/stores/onboarding';

const POLL_MS = 5_000;

const account = useAccountStore();
const store = useOnboardingStore();
const error = ref<string | null>(null);
let timer: ReturnType<typeof setTimeout> | null = null;

function stopPolling() {
  if (timer) { clearTimeout(timer); timer = null; }
}

async function pollForTestArc() {
  if (!account.accountId) return;
  try {
    const page = await api.arcs.list(account.accountId, { workflow: 'test', limit: 1 });
    if (page.items.length > 0) {
      store.setTestArc(page.items[0]!);
      stopPolling();
      return;
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to check for test signal';
  }
  timer = setTimeout(pollForTestArc, POLL_MS);
}

onMounted(() => {
  if (!store.testArc) timer = setTimeout(pollForTestArc, 0);
});
onBeforeUnmount(stopPolling);
</script>

<template>
  <section class="flex flex-col gap-4">
    <header>
      <h2 class="text-xl font-semibold text-text">Send yourself an email</h2>
      <p class="text-sm text-subtext0">
        Open any email client and send a message to an address on your domain.
        We’ll show it here the moment it arrives.
      </p>
    </header>

    <code
      v-if="store.domain"
      class="self-start rounded bg-surface0 px-3 py-1 text-sm text-text"
      data-testid="test-address"
    >you@{{ store.domain }}</code>

    <div
      v-if="!store.testArc"
      data-testid="signal-waiting"
      class="flex items-center gap-2 rounded-md border border-surface0 bg-mantle px-3 py-2 text-sm text-subtext1"
    >
      <span class="h-2 w-2 animate-pulse rounded-full bg-mauve" aria-hidden="true" />
      Waiting for your email…
    </div>

    <div
      v-else
      data-testid="signal-received"
      class="rounded-md border border-green bg-mantle p-3"
    >
      <header class="mb-1 flex items-center gap-2 text-xs text-green">
        <span class="h-2 w-2 rounded-full bg-green" aria-hidden="true" />
        It works — your first email just arrived.
      </header>
      <p class="text-sm text-text">{{ store.testArc.summary }}</p>
    </div>

    <p v-if="error" class="text-sm text-red">{{ error }}</p>
  </section>
</template>

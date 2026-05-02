<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';
import { api } from '@/api/client';
import { useOnboardingStore } from '@/stores/onboarding';
import Button from '@/components/ui/Button.vue';

const POLL_MS = 2000;

const store = useOnboardingStore();
const sending = ref(false);
const polling = ref(false);
const testId = ref<string | null>(null);
const error = ref<string | null>(null);
let timer: ReturnType<typeof setTimeout> | null = null;

function stopPolling() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  polling.value = false;
}

async function pollOnce() {
  if (!testId.value) return;
  try {
    const status = await api.onboarding.testEmailStatus(testId.value);
    if (status.received) {
      store.markSignalReceived();
      stopPolling();
      return;
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Status check failed';
    stopPolling();
    return;
  }
  timer = setTimeout(pollOnce, POLL_MS);
}

async function send() {
  sending.value = true;
  error.value = null;
  store.signalReceived = false;
  try {
    const res = await api.onboarding.sendTestEmail();
    testId.value = res.testId;
    store.setTestEmail(res.to);
    polling.value = true;
    pollOnce();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to send test email';
  } finally {
    sending.value = false;
  }
}

onBeforeUnmount(stopPolling);
</script>

<template>
  <section class="flex flex-col gap-4">
    <header>
      <h2 class="text-xl font-semibold text-text">Send a test email</h2>
      <p class="text-sm text-subtext0">
        We’ll generate a one-time address and watch for the inbound signal.
      </p>
    </header>

    <div class="flex items-center gap-3">
      <Button :disabled="sending || polling" @click="send">
        {{ sending ? 'Sending…' : 'Send test email' }}
      </Button>
      <code
        v-if="store.testEmailTo"
        class="rounded bg-surface0 px-2 py-1 text-sm text-text"
        data-testid="test-address"
      >{{ store.testEmailTo }}</code>
    </div>

    <div
      v-if="polling"
      data-testid="signal-waiting"
      class="flex items-center gap-2 rounded-md border border-surface0 bg-mantle px-3 py-2 text-sm text-subtext1"
    >
      <span class="h-2 w-2 animate-pulse rounded-full bg-mauve" aria-hidden="true" />
      Waiting for the signal…
    </div>

    <div
      v-if="store.signalReceived"
      data-testid="signal-received"
      class="flex items-center gap-2 rounded-md border border-green bg-mantle px-3 py-2 text-sm text-green"
    >
      <span class="h-2 w-2 rounded-full bg-green" aria-hidden="true" />
      Signal received — ingestion is working.
    </div>

    <p v-if="error" class="text-sm text-red">{{ error }}</p>
  </section>
</template>

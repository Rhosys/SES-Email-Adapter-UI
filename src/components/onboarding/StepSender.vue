<script setup lang="ts">
import { ref } from 'vue';
import { api } from '@/api/client';
import { useOnboardingStore } from '@/stores/onboarding';

const store = useOnboardingStore();
const address = ref(store.senderAddress);
const displayName = ref(store.displayName);
const saving = ref(false);
const error = ref<string | null>(null);

async function save() {
  if (!address.value || !displayName.value) return;
  saving.value = true;
  error.value = null;
  try {
    await api.onboarding.setSender(address.value, displayName.value);
    store.setSender(address.value, displayName.value);
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to save sender';
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <section class="flex flex-col gap-4">
    <header>
      <h2 class="text-xl font-semibold text-text">Set up your sender</h2>
      <p class="text-sm text-subtext0">This is the From address used on outbound replies.</p>
    </header>
    <label class="flex flex-col gap-1 text-sm">
      <span class="text-subtext0">Sender address</span>
      <input
        v-model="address"
        type="email"
        placeholder="hello@example.com"
        class="rounded-md border border-surface0 bg-base px-3 py-2 text-text"
        @blur="save"
      />
    </label>
    <label class="flex flex-col gap-1 text-sm">
      <span class="text-subtext0">Display name</span>
      <input
        v-model="displayName"
        type="text"
        placeholder="Acme Support"
        class="rounded-md border border-surface0 bg-base px-3 py-2 text-text"
        @blur="save"
      />
    </label>
    <p v-if="saving" class="text-sm text-subtext0">Saving…</p>
    <p v-if="error" class="text-sm text-red">{{ error }}</p>
  </section>
</template>

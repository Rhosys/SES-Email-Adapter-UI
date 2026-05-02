<script setup lang="ts">
import { api } from '@/api/client';
import { useAccountStore } from '@/stores/account';
import { useOnboardingStore } from '@/stores/onboarding';
import type { SenderFilterMode } from '@/types/server';

const account = useAccountStore();
const store = useOnboardingStore();

// Per spec: present plain-language labels, not the internal enum values.
const MODES: Array<{ value: SenderFilterMode; title: string; description: string }> = [
  { value: 'notify_new',   title: 'Ask me about new senders', description: 'Approved senders go straight to the inbox; new ones are quarantined for review.' },
  { value: 'strict',       title: 'Strict — approved senders only', description: 'Quarantine anything that isn’t from an approved domain or scores as spam.' },
  { value: 'sender_match', title: 'Approved senders only',     description: 'Approved senders only, but ignore spam score for them.' },
  { value: 'allow_all',    title: 'Open — let everything through', description: 'Deliver everything; you triage manually.' }
];

async function choose(mode: SenderFilterMode) {
  store.setFilterMode(mode);
  if (account.accountId) {
    try {
      await api.account.setFilterMode(account.accountId, mode);
    } catch {
      // The local choice is kept so the wizard remains usable; phase 9 will
      // expose the same setting in Settings for retry.
    }
  }
}
</script>

<template>
  <section class="flex flex-col gap-4">
    <header>
      <h2 class="text-xl font-semibold text-text">Choose your filter mode</h2>
      <p class="text-sm text-subtext0">You can change this later in Settings.</p>
    </header>
    <div role="radiogroup" aria-label="Filter mode" class="flex flex-col gap-2">
      <label
        v-for="m in MODES"
        :key="m.value"
        :data-testid="`mode-${m.value}`"
        class="flex cursor-pointer items-start gap-3 rounded-md border bg-mantle p-3"
        :class="store.filterMode === m.value ? 'border-mauve' : 'border-surface0'"
      >
        <input
          type="radio"
          name="filter-mode"
          :value="m.value"
          :checked="store.filterMode === m.value"
          class="mt-1"
          @change="choose(m.value)"
        />
        <span>
          <span class="block text-sm font-medium text-text">{{ m.title }}</span>
          <span class="block text-xs text-subtext0">{{ m.description }}</span>
        </span>
      </label>
    </div>
  </section>
</template>

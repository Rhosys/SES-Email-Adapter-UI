<script setup lang="ts">
import { api } from '@/api/client';
import { useOnboardingStore } from '@/stores/onboarding';
import type { FilterMode } from '@/types/server';

const store = useOnboardingStore();

const MODES: Array<{ value: FilterMode; title: string; description: string }> = [
  { value: 'strict', title: 'Strict', description: 'Quarantine anything ambiguous. Lowest noise, highest false-positive rate.' },
  { value: 'balanced', title: 'Balanced', description: 'The default. Quarantine clear spam, deliver everything else.' },
  { value: 'permissive', title: 'Permissive', description: 'Deliver everything to the inbox; you triage manually.' }
];

async function choose(mode: FilterMode) {
  store.setFilterMode(mode);
  try {
    await api.onboarding.setFilterMode(mode);
  } catch {
    // Surface failures via the next-step button being disabled until success;
    // for now the local choice is kept so the wizard remains usable.
  }
}
</script>

<template>
  <section class="flex flex-col gap-4">
    <header>
      <h2 class="text-xl font-semibold text-text">Choose a filter mode</h2>
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

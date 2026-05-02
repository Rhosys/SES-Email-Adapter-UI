<script setup lang="ts">
import { ref } from 'vue';
import { RouterLink } from 'vue-router';
import { api } from '@/api/client';
import { useOnboardingStore } from '@/stores/onboarding';
import Button from '@/components/ui/Button.vue';

const store = useOnboardingStore();
const saving = ref(false);
const error = ref<string | null>(null);
const completed = ref(false);

async function finish() {
  saving.value = true;
  error.value = null;
  try {
    await api.onboarding.complete();
    completed.value = true;
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to complete onboarding';
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <section class="flex flex-col gap-4">
    <header>
      <h2 class="text-xl font-semibold text-text">You’re ready</h2>
      <p class="text-sm text-subtext0">Quick recap of your setup:</p>
    </header>
    <dl class="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm" data-testid="recap">
      <dt class="text-subtext0">Domain</dt><dd class="text-text">{{ store.domain }}</dd>
      <dt class="text-subtext0">Sender</dt><dd class="text-text">{{ store.displayName }} &lt;{{ store.senderAddress }}&gt;</dd>
      <dt class="text-subtext0">Filter mode</dt><dd class="text-text capitalize">{{ store.filterMode }}</dd>
    </dl>
    <div class="flex items-center gap-3">
      <Button v-if="!completed" :disabled="saving" @click="finish">
        {{ saving ? 'Finishing…' : 'Finish setup' }}
      </Button>
      <RouterLink
        v-else
        to="/"
        data-testid="go-to-inbox"
        class="inline-flex items-center justify-center rounded-md bg-mauve px-3 py-1.5 text-sm font-medium text-base hover:opacity-90"
      >
        Go to Inbox
      </RouterLink>
      <span v-if="error" class="text-sm text-red">{{ error }}</span>
    </div>
  </section>
</template>

<script setup lang="ts">
import { useOnboardingStore } from '@/stores/onboarding';
import StepIndicator from '@/components/onboarding/StepIndicator.vue';
import StepDomain from '@/components/onboarding/StepDomain.vue';
import StepTestEmail from '@/components/onboarding/StepTestEmail.vue';
import StepSender from '@/components/onboarding/StepSender.vue';
import StepFilterMode from '@/components/onboarding/StepFilterMode.vue';
import StepDone from '@/components/onboarding/StepDone.vue';
import Button from '@/components/ui/Button.vue';

const store = useOnboardingStore();
</script>

<template>
  <div class="flex min-h-screen items-start justify-center bg-base px-4 py-12">
    <div class="w-full max-w-2xl rounded-lg border border-surface0 bg-mantle p-6 shadow-lg">
      <div class="mb-6 flex items-center justify-between">
        <h1 class="text-sm font-semibold uppercase tracking-wide text-subtext0">
          Welcome
        </h1>
        <StepIndicator :current="store.step" />
      </div>

      <StepDomain v-if="store.step === 1" />
      <StepTestEmail v-else-if="store.step === 2" />
      <StepSender v-else-if="store.step === 3" />
      <StepFilterMode v-else-if="store.step === 4" />
      <StepDone v-else-if="store.step === 5" />

      <footer class="mt-8 flex items-center justify-between">
        <Button variant="ghost" :disabled="store.step === 1" @click="store.back()">
          Back
        </Button>
        <Button
          v-if="!store.isLastStep"
          data-testid="next-step"
          :disabled="!store.canAdvance"
          @click="store.next()"
        >
          Next
        </Button>
      </footer>
    </div>
  </div>
</template>

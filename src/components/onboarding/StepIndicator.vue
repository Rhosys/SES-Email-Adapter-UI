<script setup lang="ts">
import { TOTAL_STEPS, type StepId } from '@/stores/onboarding';

const props = defineProps<{ current: StepId }>();

const steps = Array.from({ length: TOTAL_STEPS }, (_, i) => (i + 1) as StepId);

function stateOf(n: StepId): 'done' | 'current' | 'todo' {
  if (n < props.current) return 'done';
  if (n === props.current) return 'current';
  return 'todo';
}
</script>

<template>
  <ol
    role="list"
    aria-label="Onboarding progress"
    class="flex items-center gap-2"
  >
    <li
      v-for="n in steps"
      :key="n"
      :data-state="stateOf(n)"
      :aria-current="n === current ? 'step' : undefined"
      class="flex items-center gap-2"
    >
      <span
        class="flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold"
        :class="{
          'bg-green text-base': stateOf(n) === 'done',
          'bg-mauve text-base': stateOf(n) === 'current',
          'bg-surface0 text-subtext0': stateOf(n) === 'todo'
        }"
      >
        {{ n }}
      </span>
      <span
        v-if="n < TOTAL_STEPS"
        class="h-px w-8"
        :class="stateOf(n) === 'done' ? 'bg-green' : 'bg-surface0'"
        aria-hidden="true"
      />
    </li>
  </ol>
</template>

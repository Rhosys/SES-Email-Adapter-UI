<script setup lang="ts">
import { inject, computed } from 'vue'
import { RouterLink } from 'vue-router'
import type { Arc } from '@/types/server'
import { NOW_KEY } from '@/composables/useRelativeTime'
import { urgencyStripeColor } from '@/composables/useUrgencyStyle'
import { formatRelativeTime } from '@/composables/useFormattedTime'
import WorkflowIcon from './WorkflowIcon.vue'
import LabelChip from './LabelChip.vue'
import UrgencyBadge from './UrgencyBadge.vue'

const props = defineProps<{ arc: Arc; selected: boolean }>()
const emit = defineEmits<{ (e: 'toggle-select', id: string): void }>()

const now = inject(NOW_KEY)

const isUnread = computed(() => !props.arc.lastUserConfirmedAt)
const stripeColor = computed(() => urgencyStripeColor(props.arc.urgency))
const timestamp = computed(() => (now ? formatRelativeTime(props.arc.lastSignalAt, now.value) : ''))
</script>

<template>
  <div
    class="group relative flex items-center gap-3 border-b border-ctp-surface0 px-3 py-3 transition-colors hover:bg-ctp-surface0"
    :class="isUnread ? 'bg-ctp-surface0' : 'bg-ctp-base'"
    role="row"
  >
    <!-- Urgency stripe -->
    <div
      class="absolute inset-y-0 left-0 w-0.5 rounded-r"
      :style="{ backgroundColor: stripeColor }"
    />

    <!-- Checkbox -->
    <div
      class="ml-2 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
      :class="{ 'opacity-100': selected }"
    >
      <input
        type="checkbox"
        :checked="selected"
        class="h-4 w-4 rounded border-ctp-overlay0 bg-ctp-surface1 accent-ctp-blue"
        :aria-label="`Select arc: ${arc.summary}`"
        @change="emit('toggle-select', arc.id)"
      />
    </div>

    <!-- Workflow icon -->
    <WorkflowIcon :workflow="arc.workflow" />

    <!-- Center content — clickable link to detail -->
    <RouterLink :to="{ name: 'arc-detail', params: { id: arc.id } }" class="min-w-0 flex-1">
      <p class="truncate text-sm text-ctp-text" :class="{ 'font-semibold': isUnread }">
        {{ arc.summary }}
      </p>
      <div class="mt-0.5 flex flex-wrap items-center gap-1">
        <LabelChip v-for="label in arc.labels" :key="label" :label="label" />
      </div>
    </RouterLink>

    <!-- Right side: timestamp + urgency badge -->
    <div class="flex shrink-0 flex-col items-end gap-1">
      <UrgencyBadge :urgency="arc.urgency" />
      <span class="text-xs text-ctp-subtext0">{{ timestamp }}</span>
    </div>
  </div>
</template>

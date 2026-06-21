<script setup lang="ts">
import { computed, inject } from 'vue'
import { RouterLink } from 'vue-router'
import type { Arc } from '@/types/server'
import { NOW_KEY } from '@/composables/useRelativeTime'
import { formatRelativeTime } from '@/composables/useFormattedTime'

const props = defineProps<{ arc: Arc }>()

const now = inject(NOW_KEY)

const timestamp = computed(() =>
  now ? formatRelativeTime(props.arc.lastSignalAt, now.value) : '',
)
</script>

<template>
  <RouterLink :to="{ name: 'arc-detail', params: { id: arc.arcId } }" class="min-w-0 flex-1">
    <div class="flex items-center gap-2">
      <span class="w-40 shrink-0 truncate text-sm font-semibold text-ctp-text">{{ arc.senderAddress || 'Unknown' }}</span>
      <span class="flex-1 truncate text-sm text-ctp-subtext1">{{ arc.subject || arc.summary }}</span>
      <span class="shrink-0 text-xs text-ctp-subtext0">{{ timestamp }}</span>
    </div>
    <div class="mt-0.5 flex items-center gap-1.5">
      <span
        v-for="label in arc.labels"
        :key="label"
        class="h-2 w-2 shrink-0 rounded-full bg-ctp-mauve"
      />
      <span v-if="arc.summary && arc.subject" class="truncate text-xs text-ctp-subtext0">{{ arc.summary }}</span>
    </div>
  </RouterLink>
</template>

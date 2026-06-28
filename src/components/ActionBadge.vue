<script setup lang="ts">
import type { RuleActionType } from '@/types/server'
import { ACTION_LABELS, ACTION_COLORS } from '@/lib/rule-display'

defineProps<{ type: RuleActionType }>()
</script>

<template>
  <span
    class="rounded-full px-2 py-0.5 text-xs font-medium"
    :class="ACTION_COLORS[type] ?? 'text-ctp-subtext0 bg-ctp-surface1'"
  >
    {{ ACTION_LABELS[type] ?? type }}
  </span>
</template>

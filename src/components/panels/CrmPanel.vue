<script setup lang="ts">
import type { CrmData } from '@/types/server'

defineProps<{ data: CrmData; compact?: boolean }>()
</script>

<template>
  <!-- Compact: single row for inbox thread list -->
  <div v-if="compact" class="flex items-center gap-2 text-xs">
    <span class="shrink-0 text-ctp-subtext0">🏢</span>
    <span v-if="data.senderCompany" class="shrink-0 font-medium text-ctp-text">{{ data.senderCompany }}</span>
    <span v-if="data.senderRole" class="shrink-0 text-ctp-subtext0">{{ data.senderRole }}</span>
  </div>

  <!-- Full: detail view card -->
  <div v-else class="rounded-lg border border-ctp-surface1 bg-ctp-mantle p-4">
    <div class="flex flex-wrap items-center gap-3">
      <div>
        <div v-if="data.senderCompany" class="text-sm font-medium text-ctp-text">
          {{ data.senderCompany }}
        </div>
        <div v-if="data.senderRole" class="text-xs text-ctp-subtext0">
          {{ data.senderRole }}
          <span v-if="data.senderCompany"> at {{ data.senderCompany }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

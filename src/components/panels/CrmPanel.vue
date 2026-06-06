<script setup lang="ts">
import type { CrmData } from '@/types/server'

defineProps<{ data: CrmData }>()
</script>

<template>
  <div class="rounded-lg border border-ctp-surface1 bg-ctp-mantle p-4">
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

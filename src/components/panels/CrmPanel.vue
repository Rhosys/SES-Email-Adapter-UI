<script setup lang="ts">
import type { CrmData } from '@/types/server'

defineProps<{ data: CrmData }>()

const typeLabel: Record<CrmData['crmType'], string> = {
  sales_outreach: 'Sales outreach',
  follow_up: 'Follow-up',
  client_message: 'Client message',
  proposal: 'Proposal',
  contract: 'Contract',
  support: 'Support request',
}

const formattedValue = (amount: number, currency?: string) => {
  const fmt = new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: currency ?? 'USD',
    maximumFractionDigits: 0,
  })
  return fmt.format(amount)
}
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

      <span class="text-xs text-ctp-subtext0">{{ typeLabel[data.crmType] }}</span>

      <span
        v-if="data.dealValue"
        class="rounded-full bg-ctp-surface1 px-2 py-0.5 text-xs text-ctp-green"
      >
        {{ formattedValue(data.dealValue, data.currency) }}
      </span>

      <span
        v-if="data.requiresReply"
        class="rounded-full border border-ctp-peach px-2 py-0.5 text-xs text-ctp-peach"
      >
        Reply needed
      </span>
    </div>
  </div>
</template>

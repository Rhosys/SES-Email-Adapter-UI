<script setup lang="ts">
import { computed } from 'vue'
import type { PaymentsData } from '@/types/server'
import { useClipboard } from '@/composables/useClipboard'

const props = defineProps<{ data: PaymentsData }>()
const { copied, copy } = useClipboard()

const typeLabel: Record<PaymentsData['paymentType'], string> = {
  invoice: 'Invoice',
  receipt: 'Receipt',
  subscription_renewal: 'Subscription renewal',
  payment_failed: 'Payment failed',
  plan_changed: 'Plan changed',
  tax: 'Tax document',
  wire_transfer: 'Wire transfer',
  refund: 'Refund',
  statement: 'Statement',
  other: 'Payment',
}

const isActionRequired = computed(() =>
  ['invoice', 'payment_failed', 'subscription_renewal'].includes(props.data.paymentType),
)

const formattedAmount = computed(() => {
  if (!props.data.amount) return null
  const fmt = new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: props.data.currency ?? 'USD',
  })
  return fmt.format(props.data.amount)
})

const dueDateLabel = computed(() => {
  if (!props.data.dueDate) return null
  const d = new Date(props.data.dueDate)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = Math.floor((d.getTime() - today.getTime()) / 86400000)
  if (diff < 0)
    return { text: `Overdue since ${d.toLocaleDateString()}`, urgent: true, overdue: true }
  if (diff === 0) return { text: 'Due today', urgent: true, overdue: false }
  if (diff <= 3)
    return { text: `Due in ${diff} day${diff === 1 ? '' : 's'}`, urgent: true, overdue: false }
  return { text: `Due ${d.toLocaleDateString()}`, urgent: false, overdue: false }
})
</script>

<template>
  <div class="rounded-lg border border-ctp-surface1 bg-ctp-mantle p-4">
    <!-- Payment failed banner -->
    <div
      v-if="data.paymentType === 'payment_failed'"
      class="mb-3 rounded border border-ctp-red bg-ctp-red/10 p-3"
    >
      <p class="text-sm font-medium text-ctp-red">⚠ Payment failed — action required</p>
      <p v-if="formattedAmount" class="text-xs text-ctp-red">
        Payment of {{ formattedAmount }} to {{ data.vendor }} failed.
      </p>
      <a
        v-if="data.managementUrl"
        :href="data.managementUrl"
        target="_blank"
        rel="noopener noreferrer"
        class="mt-1 inline-block text-xs text-ctp-red hover:underline"
      >
        Update payment method →
      </a>
    </div>

    <div class="flex flex-wrap items-start justify-between gap-2">
      <div>
        <span class="text-sm font-medium text-ctp-text">{{ data.vendor }}</span>
        <span class="ml-2 text-xs text-ctp-subtext0">{{ typeLabel[data.paymentType] }}</span>
      </div>

      <div
        v-if="formattedAmount"
        class="text-sm font-semibold"
        :class="data.paymentType === 'refund' ? 'text-ctp-green' : 'text-ctp-text'"
      >
        <span class="mr-1 text-xs font-normal text-ctp-subtext0">
          {{
            data.paymentType === 'receipt'
              ? 'Paid:'
              : data.paymentType === 'refund'
                ? 'Refund:'
                : 'Due:'
          }}
        </span>
        {{ formattedAmount }}
      </div>
    </div>

    <div v-if="data.invoiceNumber" class="mt-2 flex items-center gap-1">
      <code class="rounded bg-ctp-surface1 px-2 py-0.5 font-mono text-xs text-ctp-text">
        {{ data.invoiceNumber }}
      </code>
      <button
        class="text-xs text-ctp-subtext0 hover:text-ctp-text"
        @click="copy(data.invoiceNumber!)"
      >
        {{ copied ? '✓' : 'Copy' }}
      </button>
    </div>

    <p
      v-if="dueDateLabel"
      class="mt-2 text-xs"
      :class="dueDateLabel.urgent ? 'font-medium text-ctp-red' : 'text-ctp-subtext0'"
    >
      {{ dueDateLabel.text }}
    </p>

    <div v-if="data.accountLastFour" class="mt-1 text-xs text-ctp-subtext0">
      Visa ····{{ data.accountLastFour }}
    </div>

    <!-- Actions -->
    <div v-if="isActionRequired" class="mt-3 flex flex-wrap gap-2">
      <a
        v-if="data.managementUrl && data.paymentType !== 'payment_failed'"
        :href="data.managementUrl"
        target="_blank"
        rel="noopener noreferrer"
        class="rounded bg-ctp-blue px-3 py-1.5 text-xs font-medium text-ctp-base hover:opacity-90"
      >
        Pay now
      </a>
      <a
        v-if="data.downloadUrl"
        :href="data.downloadUrl"
        target="_blank"
        rel="noopener noreferrer"
        class="rounded border border-ctp-surface1 px-3 py-1.5 text-xs text-ctp-text hover:bg-ctp-surface1"
      >
        Download PDF
      </a>
    </div>
  </div>
</template>

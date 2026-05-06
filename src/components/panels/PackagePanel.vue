<script setup lang="ts">
import { computed } from 'vue'
import type { PackageData } from '@/types/server'

const props = defineProps<{ data: PackageData }>()

type PackageStep = 'ordered' | 'shipped' | 'in_transit' | 'out_for_delivery' | 'delivered'

const steps: PackageStep[] = ['ordered', 'shipped', 'in_transit', 'out_for_delivery', 'delivered']

const stepLabels: Record<PackageStep, string> = {
  ordered: 'Ordered',
  shipped: 'Shipped',
  in_transit: 'In transit',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
}

const typeToStep: Record<PackageData['packageType'], PackageStep> = {
  confirmation: 'ordered',
  shipping: 'shipped',
  out_for_delivery: 'out_for_delivery',
  delivered: 'delivered',
  return: 'delivered',
  refund: 'delivered',
  cancellation: 'ordered',
}

const activeStep = computed(() => typeToStep[props.data.packageType])
const activeIndex = computed(() => steps.indexOf(activeStep.value))
const isCancelled = computed(() => props.data.packageType === 'cancellation')
const isReturn = computed(
  () => props.data.packageType === 'return' || props.data.packageType === 'refund',
)

const typeLabel: Record<PackageData['packageType'], string> = {
  confirmation: 'Order confirmed',
  shipping: 'Shipped',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  return: 'Return requested',
  refund: 'Refund issued',
  cancellation: 'Order cancelled',
}

const estimatedLabel = computed(() => {
  if (!props.data.estimatedDelivery) return null
  const d = new Date(props.data.estimatedDelivery)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = Math.floor((d.getTime() - today.getTime()) / 86400000)
  if (diff === 0) return { text: 'Arriving today', urgent: true }
  if (diff < 0) return { text: 'Expected ' + d.toLocaleDateString(), urgent: true }
  return {
    text:
      'Arrives ' +
      d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }),
    urgent: false,
  }
})
</script>

<template>
  <div class="rounded-lg border border-ctp-surface1 bg-ctp-mantle p-4">
    <div class="mb-3 flex items-center justify-between">
      <div>
        <span class="text-sm font-medium text-ctp-text">{{ data.retailer }}</span>
        <span class="ml-2 text-xs text-ctp-subtext0">{{ typeLabel[data.packageType] }}</span>
        <span v-if="data.orderNumber" class="ml-2 text-xs text-ctp-subtext0"
          >#{{ data.orderNumber }}</span
        >
      </div>
      <a
        v-if="data.trackingUrl"
        :href="data.trackingUrl"
        target="_blank"
        rel="noopener noreferrer"
        class="text-xs text-ctp-blue hover:underline"
      >
        Track →
      </a>
    </div>

    <!-- Delivery status bar -->
    <div v-if="!isReturn" class="mb-3 flex items-center gap-0">
      <template v-for="(step, i) in steps" :key="step">
        <div class="flex flex-col items-center">
          <div
            class="h-3 w-3 rounded-full border-2 transition-colors"
            :class="
              isCancelled
                ? 'border-ctp-subtext0 bg-ctp-surface1'
                : i <= activeIndex
                  ? 'border-ctp-green bg-ctp-green'
                  : 'border-ctp-overlay0 bg-transparent'
            "
          />
          <span class="mt-1 text-xs text-ctp-subtext0" style="white-space: nowrap">
            {{ stepLabels[step] }}
          </span>
        </div>
        <div
          v-if="i < steps.length - 1"
          class="mb-3 h-0.5 flex-1 transition-colors"
          :class="i < activeIndex ? 'bg-ctp-green' : 'bg-ctp-overlay0'"
        />
      </template>
    </div>

    <p
      v-if="estimatedLabel"
      class="text-xs"
      :class="estimatedLabel.urgent ? 'text-ctp-peach' : 'text-ctp-subtext0'"
    >
      {{ estimatedLabel.text }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, inject } from 'vue'
import { RouterLink } from 'vue-router'
import type { QuarantinedSignal, BlockedSignal } from '@/types/server'
import { isInboundEmailSignal } from '@/lib/signal-guards'
import { NOW_KEY } from '@/composables/useRelativeTime'
import { formatRelativeTime } from '@/composables/useFormattedTime'
import StatusBadge from './StatusBadge.vue'
import OverflowMenu from '@/components/ui/OverflowMenu.vue'

const props = withDefaults(defineProps<{
  signal: QuarantinedSignal | BlockedSignal
  pending: boolean
  routeName?: string
  deletable?: boolean
}>(), { routeName: 'quarantine-detail', deletable: false })

const emit = defineEmits<{ delete: [signalId: string] }>()

const now = inject(NOW_KEY)

const inboundData = computed(() => isInboundEmailSignal(props.signal) ? props.signal.data : null)

const timestamp = computed(() => {
  const receivedAt = inboundData.value?.receivedAt
  if (!receivedAt || !now) return ''
  return formatRelativeTime(receivedAt, now.value)
})

const matchedRules = computed(() => inboundData.value?.matchedRules ?? [])
const reasonLabel = computed(() => {
  if (matchedRules.value.some((r) => r.ruleId === 'SR-00')) return 'Unknown sender'
  return null
})

const isHidden = computed(() => props.signal.status === 'quarantine_hidden')
const toAddress = computed(() => inboundData.value?.to[0]?.address ?? '')
const fromAddress = computed(() => inboundData.value?.from.address ?? '')
const fromDisplay = computed(() => inboundData.value?.from.name || inboundData.value?.from.address || '')
const subject = computed(() => inboundData.value?.subject ?? '')
</script>

<template>
  <div
    class="relative border-b border-ctp-surface0 transition-colors hover:bg-ctp-surface0"
    :class="{ 'opacity-50': pending, 'bg-ctp-mantle/40': isHidden }"
    role="listitem"
  >
    <!-- Stretched link covers the whole row so the card stays clickable while the
         overflow menu (a real button) lives above it without nesting inside an <a>. -->
    <RouterLink
      :to="{ name: props.routeName, params: { id: signal.signalId } }"
      class="absolute inset-0 z-0"
      :aria-label="`Open email from ${fromDisplay || fromAddress}`"
    />

    <div class="pointer-events-none relative z-10 flex items-start gap-3 px-4 py-4 sm:py-3">
      <!-- Quarantine status badge -->
      <div class="mt-0.5 shrink-0">
        <StatusBadge :status="signal.status" />
        <span
          v-if="reasonLabel"
          class="ml-1 inline-block rounded-full bg-ctp-peach/15 px-2 py-0.5 text-xs text-ctp-peach"
        >
          {{ reasonLabel }}
        </span>
      </div>

      <!-- Content -->
      <div class="min-w-0 flex-1">
        <div class="flex items-center justify-between gap-2">
          <p class="truncate text-[15px] font-medium text-ctp-text sm:text-sm">
            {{ fromDisplay }}
            <span class="font-normal text-ctp-subtext0">&lt;{{ fromAddress }}&gt;</span>
          </p>
          <span class="shrink-0 text-xs text-ctp-subtext0">{{ timestamp }}</span>
        </div>

        <p class="mt-1 truncate text-sm text-ctp-subtext1 sm:mt-0.5">{{ subject }}</p>

        <p v-if="toAddress" class="mt-1.5 text-xs text-ctp-subtext0 sm:mt-1">
          <span class="text-ctp-overlay1">To:</span> <span class="text-ctp-sapphire">{{ toAddress }}</span>
        </p>
      </div>

      <!-- Overflow menu (blocked/spam rows) -->
      <OverflowMenu
        v-if="deletable"
        class="pointer-events-auto -my-1 shrink-0"
        label="Blocked email actions"
        menu-width-class="min-w-40"
        icon-class="h-5 w-5 sm:h-3.5 sm:w-3.5"
        trigger-class="flex h-11 w-11 sm:h-8 sm:w-8 items-center justify-center rounded-lg text-ctp-subtext0 hover:bg-ctp-surface1 hover:text-ctp-text"
      >
        <button
          class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-ctp-red hover:bg-ctp-surface0"
          role="menuitem"
          @click="emit('delete', signal.signalId)"
        >
          <svg class="h-3.5 w-3.5 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M2 4h12M5.333 4V2.667a1.333 1.333 0 011.334-1.334h2.666a1.333 1.333 0 011.334 1.334V4m2 0v9.333a1.333 1.333 0 01-1.334 1.334H4.667a1.333 1.333 0 01-1.334-1.334V4h9.334z" />
          </svg>
          Delete
        </button>
      </OverflowMenu>
    </div>
  </div>
</template>

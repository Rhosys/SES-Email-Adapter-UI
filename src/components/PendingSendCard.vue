<script setup lang="ts">
import { useAccountStore } from '@/stores/account'
import { useSignalCacheHelpers } from '@/composables/useSignalQueries'
import { api } from '@/lib/api'
import { isOutboundEmailSignal } from '@/lib/signal-guards'
import { usePendingSendCountdown } from '@/composables/usePendingSend'
import type { Signal } from '@/types/server'
import AsyncButton from '@/components/ui/AsyncButton.vue'

const props = defineProps<{ signal: Signal }>()
const emit = defineEmits<{ cancelled: [] }>()

const accountStore = useAccountStore()
const { updateSignal } = useSignalCacheHelpers()

const { cancellable, remainingSeconds } = usePendingSendCountdown(props.signal)

const emailData = isOutboundEmailSignal(props.signal) ? props.signal.data : null
const subject = emailData?.subject ?? ''
const toLabel = emailData?.to?.map((e) => e.address).join(', ') ?? ''

async function cancelSend() {
  if (!accountStore.accountId || !props.signal.threadId) return
  const result = await api.patchSignal(accountStore.accountId, props.signal.threadId, props.signal.signalId, { status: 'draft' })
  if (result.isOk() && props.signal.threadId) {
    updateSignal(props.signal.threadId, result.value)
  }
  emit('cancelled')
}
</script>

<template>
  <div class="rounded-lg border border-ctp-peach/40 bg-ctp-mantle">
    <!-- Banner -->
    <div class="flex items-center justify-between rounded-t-lg bg-ctp-peach/10 px-4 py-2">
      <span class="text-sm font-medium text-ctp-green">Sent</span>
      <span v-if="cancellable" class="text-xs text-ctp-subtext0">
        Undo available for {{ remainingSeconds }}s
      </span>
    </div>

    <!-- Content -->
    <div class="px-4 py-3">
      <div v-if="toLabel" class="mb-1 text-xs text-ctp-subtext0">
        <span class="font-medium">To:</span> {{ toLabel }}
      </div>
      <div v-if="subject" class="text-sm text-ctp-text">{{ subject }}</div>
    </div>

    <!-- Actions -->
    <div v-if="cancellable" class="flex justify-end border-t border-ctp-peach/20 px-4 py-2">
      <AsyncButton
        :action="cancelSend"
        class="gap-1.5 rounded-lg border border-ctp-peach/50 px-3 py-1.5 text-sm font-medium text-ctp-peach hover:bg-ctp-peach/10"
      >
        <svg class="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M7 3.5L2 8l5 4.5V9.5c4.5 0 6.5 1.5 8 4.5-.5-4.5-3-8-8-8V3.5z"/>
        </svg>
        Undo send
      </AsyncButton>
    </div>
  </div>
</template>

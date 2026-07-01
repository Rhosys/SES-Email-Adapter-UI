<script setup lang="ts">
import { useAccountStore } from '@/stores/account'
import { useSignalsStore } from '@/stores/signals'
import { api } from '@/lib/api'
import { isOutboundEmailSignal } from '@/lib/signal-guards'
import { usePendingSendCountdown } from '@/composables/usePendingSend'
import type { Signal } from '@/types/server'
import AsyncButton from '@/components/ui/AsyncButton.vue'

const props = defineProps<{ signal: Signal }>()
const emit = defineEmits<{ cancelled: [] }>()

const accountStore = useAccountStore()
const signalsStore = useSignalsStore()

const { cancellable, remainingSeconds } = usePendingSendCountdown(props.signal)

const emailData = isOutboundEmailSignal(props.signal) ? props.signal.data : null
const subject = emailData?.subject ?? ''
const toLabel = emailData?.to?.map((e) => e.address).join(', ') ?? ''

async function cancelSend() {
  if (!accountStore.accountId) return
  const result = await api.patchSignal(accountStore.accountId, props.signal.signalId, { status: 'draft' })
  if (result.isOk() && props.signal.threadId) {
    signalsStore.updateSignal(props.signal.threadId, result.value)
  }
  emit('cancelled')
}
</script>

<template>
  <div class="rounded-lg border border-ctp-peach/40 bg-ctp-mantle">
    <!-- Banner -->
    <div class="flex items-center justify-between rounded-t-lg bg-ctp-peach/10 px-4 py-2">
      <span v-if="cancellable" class="text-sm font-medium text-ctp-peach">
        Sending in {{ remainingSeconds }}s — cancel?
      </span>
      <span v-else class="text-sm font-medium text-ctp-green">Sent</span>
    </div>

    <!-- Content -->
    <div class="px-4 py-3">
      <div v-if="toLabel" class="mb-1 text-xs text-ctp-subtext0">
        <span class="font-medium">To:</span> {{ toLabel }}
      </div>
      <div v-if="subject" class="text-sm text-ctp-text">{{ subject }}</div>
    </div>

    <!-- Actions -->
    <div v-if="cancellable" class="border-t border-ctp-peach/20 px-4 py-2">
      <AsyncButton
        :action="cancelSend"
        variant="outline"
        class="text-sm text-ctp-peach hover:opacity-80"
      >
        Cancel send
      </AsyncButton>
    </div>
  </div>
</template>

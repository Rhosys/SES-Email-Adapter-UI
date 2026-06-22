<script setup lang="ts">
import { computed, inject } from 'vue'
import { RouterLink } from 'vue-router'
import { useAccountStore } from '@/stores/account'
import { api } from '@/lib/api'
import type { Signal } from '@/types/server'
import { isEmailSignal } from '@/lib/signal-guards'
import { NOW_KEY } from '@/composables/useRelativeTime'
import { formatRelativeTime } from '@/composables/useFormattedTime'
import AsyncButton from '@/components/ui/AsyncButton.vue'

const props = defineProps<{
  signal: Signal
  pending: boolean
}>()

const emit = defineEmits<{ discard: [] }>()

const accountStore = useAccountStore()

const now = inject(NOW_KEY)

const emailData = computed(() => (isEmailSignal(props.signal) ? props.signal.data : null))

const timestamp = computed(() => {
  if (!now) return ''
  return formatRelativeTime(props.signal.createdAt, now.value)
})

const toAddress = computed(() => emailData.value?.to?.[0]?.address ?? '')
const subject = computed(() => emailData.value?.subject || 'New draft')
const snippet = computed(() => emailData.value?.body?.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() ?? '')

async function discard() {
  if (!accountStore.accountId) return
  await api.deleteDraftSignal(accountStore.accountId, props.signal.signalId)
  emit('discard')
}
</script>

<template>
  <div
    class="flex items-start gap-3 border-b border-ctp-surface0 px-4 py-3 transition-colors hover:bg-ctp-surface0"
    :class="{ 'opacity-50': pending }"
    role="listitem"
  >
    <RouterLink
      :to="{ name: 'arc-detail', params: { id: signal.arcId } }"
      class="min-w-0 flex-1"
    >
      <div class="flex items-center justify-between gap-2">
        <p class="truncate text-sm font-medium text-ctp-text">
          {{ subject }}
        </p>
        <span class="shrink-0 text-xs text-ctp-subtext0">{{ timestamp }}</span>
      </div>

      <p v-if="toAddress" class="mt-1 text-xs text-ctp-subtext0">
        <span class="text-ctp-overlay1">To:</span> <span class="text-ctp-sapphire">{{ toAddress }}</span>
      </p>

      <p v-if="snippet" class="mt-0.5 truncate text-sm text-ctp-subtext1">{{ snippet }}</p>
    </RouterLink>

    <AsyncButton
      :action="discard"
      variant="ghost"
      class="shrink-0 text-xs text-ctp-subtext0 hover:text-ctp-red"
    >
      Discard
    </AsyncButton>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import { useQuarantineStore } from '@/stores/quarantine'
import { useAccountStore } from '@/stores/account'
import { isInboundEmailSignal } from '@/lib/signal-guards'
import SignalRenderer from '@/components/SignalRenderer.vue'
import AsyncButton from '@/components/ui/AsyncButton.vue'

const route = useRoute()
const router = useRouter()
const quarantineStore = useQuarantineStore()
const accountStore = useAccountStore()

const signalId = computed(() => route.params.id as string)
const loading = ref(true)
const notFound = ref(false)

const signal = computed(() =>
  [...quarantineStore.quarantineVisible, ...quarantineStore.quarantineHidden].find(
    (s) => s.signalId === signalId.value,
  ) ?? null,
)

const inboundData = computed(() => (signal.value && isInboundEmailSignal(signal.value) ? signal.value.data : null))
const isHidden = computed(() => signal.value?.status === 'quarantine_hidden')
const pending = computed(() => (signal.value ? quarantineStore.actionPending.has(signal.value.signalId) : false))

onMounted(async () => {
  loading.value = true
  await accountStore.fetchAccount()
  if (!signal.value) {
    await quarantineStore.fetchSignals(true)
  }
  loading.value = false
  notFound.value = !signal.value
})

async function allow() {
  if (!signal.value) return
  const ok = await quarantineStore.allow(signal.value.signalId)
  if (ok) void router.push('/quarantine')
}

async function reject() {
  if (!signal.value) return
  const ok = await quarantineStore.reject(signal.value.signalId)
  if (ok) void router.push('/quarantine')
}
</script>

<template>
  <div class="quarantine-detail mx-auto flex min-h-full max-w-3xl flex-col px-4 py-6">
    <RouterLink
      to="/quarantine"
      class="mb-4 inline-flex items-center gap-1 text-sm text-ctp-subtext0 hover:text-ctp-text"
    >
      ← Back to quarantine
    </RouterLink>

    <!-- Loading -->
    <div
      v-if="loading"
      role="status"
      aria-label="Loading quarantined email…"
      class="animate-pulse"
    >
      <div class="mb-6 space-y-2">
        <div class="h-6 w-2/3 rounded bg-ctp-surface1" />
        <div class="h-3 w-32 rounded bg-ctp-surface1" />
      </div>
      <div class="rounded-lg border border-ctp-surface0 bg-ctp-mantle p-4">
        <div class="mb-3 flex items-center gap-2">
          <div class="h-3 w-28 rounded bg-ctp-surface1" />
        </div>
        <div class="space-y-2">
          <div class="h-4 w-full rounded bg-ctp-surface1" />
          <div class="h-4 w-3/4 rounded bg-ctp-surface1" />
        </div>
      </div>
    </div>

    <!-- Not found -->
    <div
      v-else-if="notFound"
      role="alert"
      class="rounded-lg border border-ctp-red bg-ctp-red/10 px-4 py-3 text-sm text-ctp-red"
    >
      This email is no longer in quarantine — it may have already been allowed or rejected.
    </div>

    <template v-else-if="signal && inboundData">
      <!-- Header -->
      <div class="mb-6">
        <div class="flex items-center gap-2">
          <span
            class="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium"
            :class="isHidden ? 'bg-ctp-surface1 text-ctp-subtext0' : 'bg-ctp-mauve/15 text-ctp-mauve'"
          >
            {{ isHidden ? 'Silently held' : 'Quarantined' }}
          </span>
          <h1 class="text-lg font-semibold text-ctp-text">{{ inboundData.subject || '(no subject)' }}</h1>
        </div>
        <div class="mt-1 text-sm text-ctp-subtext1">
          <span class="text-ctp-overlay1">From:</span>
          {{ inboundData.from.name || inboundData.from.address }}
          <span v-if="inboundData.from.name" class="text-ctp-subtext0">&lt;{{ inboundData.from.address }}&gt;</span>
        </div>
        <div v-if="inboundData.to[0]?.address" class="mt-1 text-sm text-ctp-subtext1">
          <span class="text-ctp-overlay1">To:</span> <span class="text-ctp-sapphire">{{ inboundData.to[0].address }}</span>
        </div>
      </div>

      <!-- Actions -->
      <div class="mb-6 flex flex-wrap items-center gap-2">
        <AsyncButton
          :action="allow"
          :disabled="pending"
          variant="ghost"
          class="rounded bg-ctp-green/15 px-3 py-1.5 text-sm font-medium text-ctp-green hover:bg-ctp-green/25"
        >
          Allow Sender
        </AsyncButton>
        <AsyncButton
          :action="reject"
          :disabled="pending"
          variant="ghost"
          class="rounded bg-ctp-red/15 px-3 py-1.5 text-sm font-medium text-ctp-red hover:bg-ctp-red/25"
        >
          Reject Sender
        </AsyncButton>
        <RouterLink
          :to="`/rules/new?signalId=${signal.signalId}&action=block_hidden`"
          class="rounded border border-ctp-surface1 px-3 py-1.5 text-sm text-ctp-subtext1 transition-colors hover:text-ctp-text"
        >
          Create Rule
        </RouterLink>
      </div>

      <!-- Email body -->
      <SignalRenderer :signal="signal" />
    </template>
  </div>
</template>

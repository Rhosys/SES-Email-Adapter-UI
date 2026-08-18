<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { useThreadListQuery, useArchiveThread } from '@/composables/useThreadQueries'
import { useSignalCacheHelpers } from '@/composables/useSignalQueries'
import { useAccountStore } from '@/stores/account'
import { useClipboard } from '@/composables/useClipboard'
import { isInboundEmailSignal } from '@/lib/signal-guards'
import { api } from '@/lib/api'
import type { Signal, AuthData, Workflow, WorkflowData } from '@/types/server'
import WorkflowPanel from './WorkflowPanel.vue'

const RECENCY_WINDOW_MS = 15 * 60 * 1000

const { threads: sortedThreads } = useThreadListQuery(() => 'active')
const archiveMutation = useArchiveThread()
const { threadSignals } = useSignalCacheHelpers()
const accountStore = useAccountStore()
const { copied, copy } = useClipboard()

const latestSignal = ref<Signal | null>(null)
const archiving = ref(false)
const now = ref(Date.now())
let countdownTimer: ReturnType<typeof setInterval>

onMounted(() => {
  countdownTimer = setInterval(() => { now.value = Date.now() }, 1000)
})
onUnmounted(() => clearInterval(countdownTimer))

// Most recent active thread with a signal in the last 15 minutes
const highlightThread = computed(() => {
  const currentTime = Date.now()
  return sortedThreads.value.find((t) =>
    t.status === 'active' && t.lastSignalAt && currentTime - new Date(t.lastSignalAt).getTime() < RECENCY_WINDOW_MS,
  ) ?? null
})

const inboundData = computed(() => {
  if (!latestSignal.value || !isInboundEmailSignal(latestSignal.value)) return null
  return latestSignal.value.data
})

const workflow = computed<Workflow | null>(() => inboundData.value?.workflow ?? null)
const workflowData = computed<WorkflowData | null>(() => inboundData.value?.workflowData ?? null)

const isAuth = computed(() => workflow.value === 'auth' && workflowData.value)
const authData = computed<AuthData | null>(() =>
  isAuth.value ? workflowData.value as AuthData : null,
)

const formattedCode = computed(() => {
  const code = authData.value?.code
  if (!code) return null
  if (code.length === 6) return `${code.slice(0, 3)} ${code.slice(3)}`
  return code
})

const expiresAt = computed(() => {
  if (!authData.value?.expiresInMinutes || !inboundData.value) return null
  const base = new Date(inboundData.value.receivedAt)
  return new Date(base.getTime() + parseFloat(authData.value.expiresInMinutes) * 60_000)
})

const countdown = computed(() => {
  const expiry = expiresAt.value
  if (!expiry) return { display: '', urgencyLevel: 'safe' as const }
  const ms = expiry.getTime() - now.value
  const seconds = Math.floor(ms / 1000)
  if (seconds <= 0) {
    const agoMinutes = Math.floor(Math.abs(seconds) / 60)
    return { display: agoMinutes > 0 ? `Expired ${agoMinutes}m ago` : 'Expired', urgencyLevel: 'expired' as const }
  }
  const minutes = Math.floor(seconds / 60)
  if (minutes < 5) return { display: `Expires in ${minutes}m ${seconds % 60}s`, urgencyLevel: 'critical' as const }
  return { display: `Expires in ${minutes}m`, urgencyLevel: minutes < 300 ? 'warning' as const : 'safe' as const }
})

const urgencyClass = computed(() => {
  switch (countdown.value.urgencyLevel) {
    case 'safe': return 'text-ctp-green'
    case 'warning': return 'text-ctp-peach'
    case 'critical': return 'text-ctp-red animate-pulse'
    default: return 'text-ctp-subtext0'
  }
})

const visible = computed(() => highlightThread.value && latestSignal.value && workflowData.value)

async function copyAndArchive() {
  if (!authData.value?.code || !highlightThread.value) return
  await copy(authData.value.code)
  archiving.value = true
  archiveMutation.mutate(highlightThread.value.threadId)
  archiving.value = false
}

async function fetchSignalForThread(threadId: string) {
  const accountId = accountStore.accountId
  if (!accountId) return

  // Check if signals are already cached for this thread
  const cached = threadSignals(threadId)
  if (cached.length > 0) {
    latestSignal.value = cached[0]!
    return
  }

  // Fetch the latest signal only
  const result = await api.listSignals(accountId, threadId, { limit: 1 })
  if (result.isOk() && result.value.signals.length > 0) {
    latestSignal.value = result.value.signals[0]!
  }
}

onMounted(() => {
  if (highlightThread.value) {
    void fetchSignalForThread(highlightThread.value.threadId)
  }
})

// React to thread list changes (e.g. new thread arrives via realtime)
watch(highlightThread, (thread) => {
  if (thread) {
    void fetchSignalForThread(thread.threadId)
  } else {
    latestSignal.value = null
  }
})

defineExpose({ visible })
</script>

<template>
  <div v-if="visible && highlightThread" class="mb-4 rounded-lg border border-ctp-surface0 bg-ctp-mantle p-4">
    <!-- Header: service + thread context -->
    <div class="mb-3 flex items-center justify-between">
      <RouterLink
        :to="{ name: 'thread-detail', params: { id: highlightThread.threadId } }"
        class="text-xs text-ctp-subtext0 no-underline hover:text-ctp-text hover:underline"
      >
        {{ highlightThread.sender.name ?? highlightThread.sender.address }} · {{ highlightThread.subject ?? highlightThread.summary }}
      </RouterLink>
      <span v-if="countdown.display" class="text-xs" :class="urgencyClass">{{ countdown.display }}</span>
    </div>

    <!-- Auth: inline code + copy-and-archive button -->
    <div v-if="authData && formattedCode" class="flex items-center gap-3">
      <code class="rounded bg-ctp-surface1 px-3 py-1.5 font-mono text-xl tracking-widest text-ctp-text">
        {{ formattedCode }}
      </code>
      <button
        class="rounded bg-ctp-blue px-3 py-1.5 text-sm font-medium text-ctp-base transition-opacity hover:opacity-90 disabled:opacity-50"
        :disabled="archiving"
        @click="copyAndArchive"
      >
        {{ copied ? '✓ Copied' : 'Copy code' }}
      </button>
    </div>

    <!-- Non-auth: show WorkflowPanel as-is -->
    <WorkflowPanel v-else-if="latestSignal" :signal="latestSignal" />

    <!-- Jump straight to the thread this panel was built from, rather than hunting
         for it in the list below. Only shown here — the thread detail screen is
         already the destination. -->
    <div class="mt-3 flex justify-end border-t border-ctp-surface0 pt-3">
      <RouterLink
        :to="{ name: 'thread-detail', params: { id: highlightThread.threadId } }"
        class="flex items-center gap-1.5 rounded-lg border border-ctp-surface1 px-3 py-1.5 text-xs text-ctp-subtext1 no-underline hover:border-ctp-mauve hover:text-ctp-mauve"
      >
        Go to thread
        <svg class="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M6 3.5L10.5 8 6 12.5l-1-1L8.5 8 5 4.5l1-1z"/>
        </svg>
      </RouterLink>
    </div>
  </div>
</template>

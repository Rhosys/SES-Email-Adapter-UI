<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { api } from '@/lib/api'
import { useAccountStore } from '@/stores/account'
import { useLogStore } from '@/stores/logs'
import { getUndoExpiresAt } from '@/composables/usePendingSend'
import AsyncButton from '@/components/ui/AsyncButton.vue'
import BuildInfo from '@/components/BuildInfo.vue'
import type { Thread, Signal, HealthCheckValidation, HealthCheckStatus } from '@/types/server'

const accountStore = useAccountStore()
const logStore = useLogStore()

// ── Log history (last hour) — on-device investigation aid ──────────────────
const LOG_LEVEL_CLASS: Record<string, string> = {
  CRITICAL: 'text-ctp-red',
  ERROR: 'text-ctp-red',
  WARN: 'text-ctp-peach',
  INFO: 'text-ctp-blue',
  TRACK: 'text-ctp-subtext0',
  DEBUG: 'text-ctp-subtext0',
}
function logLevelClass(level: string): string {
  return LOG_LEVEL_CLASS[level] ?? 'text-ctp-subtext1'
}
function formatLogTime(ts: string): string {
  const d = new Date(ts)
  return Number.isNaN(d.getTime()) ? ts : d.toLocaleTimeString()
}
function formatLogMessage(message: Record<string, unknown>): string {
  if (typeof message.title === 'string' && Object.keys(message).length === 1) return message.title
  try {
    return JSON.stringify(message)
  } catch (e) {
    // console directly, not the app logger — this renders the log stream
    // itself, and logging through it here risks a display feedback loop.
    // eslint-disable-next-line no-console
    console.warn('[AdminView] Failed to stringify log message', e)
    return String(message)
  }
}

// ── Health check validation ────────────────────────────────────────────────
const healthCheck = ref<HealthCheckValidation | null>(null)
const healthCheckLoading = ref(false)
const healthCheckError = ref<string | null>(null)

async function runHealthCheckValidation() {
  healthCheckLoading.value = true
  healthCheckError.value = null
  const result = await api.validateHealthCheck()
  if (result.isOk()) {
    healthCheck.value = result.value
  } else {
    healthCheckError.value = result.error.message
  }
  healthCheckLoading.value = false
}

const HEALTH_STATUS_LABEL: Record<HealthCheckStatus, string> = {
  pass: 'All checks passing',
  fail: 'One or more checks failing',
  unknown: 'Validation could not be completed',
}
function healthStatusLabel(status: HealthCheckStatus): string {
  return HEALTH_STATUS_LABEL[status] ?? status
}
// Overall alert styling by status.
const HEALTH_ALERT_CLASS: Record<HealthCheckStatus, string> = {
  pass: 'border-ctp-green/40 bg-ctp-green/10 text-ctp-green',
  fail: 'border-ctp-red/40 bg-ctp-red/10 text-ctp-red',
  unknown: 'border-ctp-peach/40 bg-ctp-peach/10 text-ctp-peach',
}
// Per-check status icon color.
const HEALTH_ITEM_CLASS: Record<HealthCheckStatus, string> = {
  pass: 'text-ctp-green',
  fail: 'text-ctp-red',
  unknown: 'text-ctp-subtext0',
}
const HEALTH_ITEM_ICON: Record<HealthCheckStatus, string> = {
  pass: '✓',
  fail: '✗',
  unknown: '—',
}

onMounted(() => {
  void runHealthCheckValidation()
})

const signalIdInput = ref('')
const loading = ref(false)
const errorMessage = ref<string | null>(null)

const signal = ref<Signal | null>(null)
const thread = ref<Thread | null>(null)
const rawEmail = ref<string | null>(null)

const reprocessing = ref(false)
const hasReprocessed = ref(false)
const showingVersion = ref<'after' | 'before'>('after')

const previousSignal = ref<Signal | null>(null)
const previousThread = ref<Thread | null>(null)

const displayedSignal = computed(() =>
  hasReprocessed.value && showingVersion.value === 'before' ? previousSignal.value : signal.value,
)
const displayedThread = computed(() =>
  hasReprocessed.value && showingVersion.value === 'before' ? previousThread.value : thread.value,
)

const htmlBody = computed(() => {
  if (!displayedSignal.value) return null
  if (displayedSignal.value.type !== 'email') return null
  return (displayedSignal.value.data as { body?: string }).body ?? null
})

const isPendingSend = computed(() => displayedSignal.value?.status === 'pending_send')
const undoExpiresAt = computed(() => displayedSignal.value ? getUndoExpiresAt(displayedSignal.value) : null)
const undoExpired = computed(() => undoExpiresAt.value ? new Date(undoExpiresAt.value).getTime() <= Date.now() : true)

async function cancelPendingSend() {
  const accountId = accountStore.accountId
  if (!accountId || !signal.value) return
  const threadId = signal.value.threadId ?? 'QUARANTINED'
  const result = await api.patchSignal(accountId, threadId, signal.value.signalId, { status: 'draft' })
  if (result.isOk()) signal.value = result.value
}

async function reprocess() {
  if (!signal.value) return
  const accountId = accountStore.accountId
  if (!accountId) return

  // Store previous versions
  previousSignal.value = structuredClone(signal.value)
  previousThread.value = thread.value ? structuredClone(thread.value) : null

  const threadId = signal.value.threadId ?? 'QUARANTINED'
  reprocessing.value = true
  const result = await api.reprocessSignal(accountId, threadId, signal.value.signalId)
  if (result.isOk()) {
    signal.value = result.value
    if (result.value.threadId) {
      const threadResult = await api.getThread(accountId, result.value.threadId)
      if (threadResult.isOk()) {
        thread.value = threadResult.value
      }
    }
    hasReprocessed.value = true
    showingVersion.value = 'after'
  } else {
    errorMessage.value = result.error.message
  }
  reprocessing.value = false
}

async function lookup() {
  const id = signalIdInput.value.trim()
  if (!id) return
  const accountId = accountStore.accountId
  if (!accountId) return

  loading.value = true
  errorMessage.value = null
  signal.value = null
  thread.value = null
  rawEmail.value = null

  const signalResult = await api.getSignal(accountId, 'QUARANTINED', id)
  if (signalResult.isErr()) {
    errorMessage.value = signalResult.error.message
    loading.value = false
    return
  }
  signal.value = signalResult.value

  // Fetch thread if signal belongs to one
  if (signalResult.value.threadId) {
    const threadResult = await api.getThread(accountId, signalResult.value.threadId)
    if (threadResult.isOk()) {
      thread.value = threadResult.value
    }
  }

  // Fetch raw email
  const rawThreadId = signalResult.value.threadId ?? 'QUARANTINED'
  const rawResult = await api.getRawEmail(accountId, rawThreadId, id)
  if (rawResult.isOk()) {
    rawEmail.value = rawResult.value
  }

  loading.value = false
}
</script>

<template>
  <div class="mx-auto flex min-h-full max-w-5xl flex-col space-y-6 p-6">
    <div>
      <h1 class="text-lg font-semibold text-ctp-text">Admin — Signal Inspector</h1>
      <BuildInfo class="mt-1" />
    </div>

    <!-- Health check validation -->
    <section>
      <div class="mb-2 flex items-center justify-between">
        <h3 class="text-sm font-medium text-ctp-subtext1">Pipeline Health Check</h3>
        <button
          :disabled="healthCheckLoading"
          class="inline-flex items-center gap-1 rounded bg-ctp-surface1 px-2 py-0.5 text-xs font-medium text-ctp-text transition-colors hover:bg-ctp-surface2 disabled:opacity-50"
          @click="runHealthCheckValidation"
        >
          <svg
            :class="{ 'animate-spin': healthCheckLoading }"
            class="h-3 w-3"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M21 12a9 9 0 1 1-6.219-8.56" stroke-linecap="round" />
          </svg>
          Refresh
        </button>
      </div>

      <!-- In-progress alert -->
      <div
        v-if="healthCheckLoading"
        class="flex items-center gap-2 rounded-lg border border-ctp-blue/30 bg-ctp-blue/10 px-4 py-3 text-sm text-ctp-blue"
      >
        <svg class="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 12a9 9 0 1 1-6.219-8.56" stroke-linecap="round" />
        </svg>
        Health check validation in progress…
      </div>

      <!-- Error alert -->
      <div
        v-else-if="healthCheckError"
        class="rounded-lg border border-ctp-red/30 bg-ctp-red/10 px-4 py-3 text-sm text-ctp-red"
      >
        Health check validation failed to run: {{ healthCheckError }}
      </div>

      <!-- Result -->
      <div v-else-if="healthCheck" class="space-y-3">
        <div class="rounded-lg border px-4 py-3 text-sm" :class="HEALTH_ALERT_CLASS[healthCheck.status]">
          <div class="font-medium">{{ healthStatusLabel(healthCheck.status) }}</div>
          <div class="mt-0.5 text-xs opacity-80">
            Validated healthcheck for {{ healthCheck.checkedDate }} · checked {{ new Date(healthCheck.checkedAt).toLocaleString() }}
          </div>
        </div>

        <ul class="divide-y divide-ctp-surface0 rounded-lg border border-ctp-surface1 bg-ctp-mantle">
          <li
            v-for="item in healthCheck.checks"
            :key="item.id"
            class="flex items-start gap-3 px-4 py-2.5"
          >
            <span class="mt-0.5 w-4 shrink-0 text-center text-sm font-bold" :class="HEALTH_ITEM_CLASS[item.status]">
              {{ HEALTH_ITEM_ICON[item.status] }}
            </span>
            <div class="min-w-0 flex-1">
              <div class="text-sm text-ctp-text">{{ item.label }}</div>
              <div v-if="item.detail" class="text-xs text-ctp-subtext0">{{ item.detail }}</div>
            </div>
            <span class="shrink-0 text-xs font-medium uppercase" :class="HEALTH_ITEM_CLASS[item.status]">
              {{ item.status }}
            </span>
          </li>
        </ul>
      </div>
    </section>

    <!-- Input -->
    <form class="flex gap-3" @submit.prevent="lookup">
      <label for="signal-id-input" class="sr-only">Signal ID</label>
      <input
        id="signal-id-input"
        v-model="signalIdInput"
        type="text"
        placeholder="Signal ID (e.g. sgn-abc123)"
        class="flex-1 rounded-lg border border-ctp-surface1 bg-ctp-base px-3 py-2 text-sm text-ctp-text placeholder:text-ctp-subtext0 focus:border-ctp-mauve focus:outline-none"
      />
      <button
        type="submit"
        :disabled="loading || !signalIdInput.trim()"
        class="rounded-lg bg-ctp-mauve px-4 py-2 text-sm font-medium text-ctp-base transition-colors hover:bg-ctp-mauve/80 disabled:opacity-50"
      >
        {{ loading ? 'Loading…' : 'Lookup' }}
      </button>
    </form>

    <!-- Error -->
    <div v-if="errorMessage" class="rounded-lg border border-ctp-red/30 bg-ctp-red/10 px-4 py-3 text-sm text-ctp-red">
      {{ errorMessage }}
    </div>

    <!-- Version switcher (shown after reprocess) -->
    <div v-if="hasReprocessed" class="flex items-center justify-center gap-4 rounded-lg border border-ctp-mauve/30 bg-ctp-mauve/5 px-4 py-2">
      <button
        class="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors"
        :class="showingVersion === 'before' ? 'bg-ctp-surface2 text-ctp-text' : 'text-ctp-subtext0 hover:text-ctp-text'"
        @click="showingVersion = 'before'"
      >
        ◀ Before
      </button>
      <span class="text-xs text-ctp-subtext0">|</span>
      <button
        class="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors"
        :class="showingVersion === 'after' ? 'bg-ctp-surface2 text-ctp-text' : 'text-ctp-subtext0 hover:text-ctp-text'"
        @click="showingVersion = 'after'"
      >
        After ▶
      </button>
    </div>

    <!-- Thread JSON -->
    <section v-if="displayedThread">
      <h3 class="mb-2 text-sm font-medium text-ctp-subtext1">Thread</h3>
      <pre class="overflow-x-auto rounded-lg border border-ctp-surface1 bg-ctp-mantle p-4 text-xs text-ctp-text">{{ JSON.stringify(displayedThread, null, 2) }}</pre>
    </section>
    <section v-else-if="displayedSignal && !displayedSignal.threadId">
      <h3 class="mb-2 text-sm font-medium text-ctp-subtext1">Thread</h3>
      <p class="text-sm text-ctp-subtext0">No thread — signal has no threadId.</p>
    </section>

    <!-- Signal JSON -->
    <section v-if="displayedSignal">
      <div class="mb-2 flex items-center gap-2">
        <h3 class="text-sm font-medium text-ctp-subtext1">Signal</h3>
        <span v-if="isPendingSend" class="rounded-full bg-ctp-peach/15 px-2 py-0.5 text-xs font-medium text-ctp-peach">pending_send</span>
        <button
          :disabled="reprocessing"
          class="inline-flex items-center gap-1 rounded bg-ctp-surface1 px-2 py-0.5 text-xs font-medium text-ctp-text transition-colors hover:bg-ctp-surface2 disabled:opacity-50"
          @click="reprocess"
        >
          <svg
            :class="{ 'animate-spin': reprocessing }"
            class="h-3 w-3"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M21 12a9 9 0 1 1-6.219-8.56" stroke-linecap="round" />
          </svg>
          Reprocess
        </button>
      </div>

      <!-- Pending send alert with cancel action -->
      <div v-if="isPendingSend" class="mb-3 flex items-center justify-between rounded-lg border border-ctp-peach/40 bg-ctp-peach/10 px-4 py-2">
        <span class="text-sm text-ctp-peach">
          {{ undoExpired ? 'Undo window expired — email has been sent' : `Undo available until ${undoExpiresAt}` }}
        </span>
        <AsyncButton
          v-if="!undoExpired"
          :action="cancelPendingSend"
          variant="outline"
          class="text-xs text-ctp-peach hover:opacity-80"
        >
          Cancel send
        </AsyncButton>
      </div>

      <pre class="overflow-x-auto rounded-lg border border-ctp-surface1 bg-ctp-mantle p-4 text-xs text-ctp-text">{{ JSON.stringify(displayedSignal, null, 2) }}</pre>
    </section>

    <!-- Raw email -->
    <section v-if="rawEmail">
      <h3 class="mb-2 text-sm font-medium text-ctp-subtext1">Raw Email</h3>
      <pre class="overflow-x-auto rounded-lg border border-ctp-surface1 bg-ctp-mantle p-4 text-xs text-ctp-text whitespace-pre-wrap break-all">{{ rawEmail }}</pre>
    </section>

    <!-- HTML body rendered -->
    <section v-if="htmlBody">
      <h3 class="mb-2 text-sm font-medium text-ctp-subtext1">Rendered HTML</h3>
      <iframe
        :srcdoc="htmlBody"
        sandbox="allow-popups allow-popups-to-escape-sandbox"
        referrerpolicy="no-referrer"
        class="w-full rounded border border-ctp-surface0 bg-white"
        style="min-height: 650px; max-height: calc(100vh - 160px)"
        title="Email HTML body"
      />
    </section>

    <!-- Log history — recent in-app logs, for investigating issues on-device -->
    <section class="flex min-h-0 flex-1 flex-col">
      <div class="mb-2 flex items-center justify-between">
        <h3 class="text-sm font-medium text-ctp-subtext1">Logs — last hour ({{ logStore.recent.length }})</h3>
        <button
          class="rounded bg-ctp-surface1 px-2 py-0.5 text-xs text-ctp-text hover:bg-ctp-surface2"
          @click="logStore.clear()"
        >
          Clear
        </button>
      </div>
      <div class="min-h-24 flex-1 overflow-y-auto rounded-lg border border-ctp-surface1 bg-ctp-mantle p-2 text-xs">
        <p v-if="!logStore.recent.length" class="p-2 text-ctp-subtext0">No logs captured in the last hour.</p>
        <div
          v-for="(entry, i) in logStore.recent"
          :key="i"
          class="flex gap-2 border-b border-ctp-surface0/50 px-1 py-1 font-mono last:border-0"
        >
          <span class="shrink-0 text-ctp-subtext0">{{ formatLogTime(entry.timestamp) }}</span>
          <span class="w-16 shrink-0 font-medium" :class="logLevelClass(entry.level)">{{ entry.level }}</span>
          <span class="min-w-0 flex-1 break-all text-ctp-text">{{ formatLogMessage(entry.message) }}</span>
        </div>
      </div>
    </section>
  </div>
</template>

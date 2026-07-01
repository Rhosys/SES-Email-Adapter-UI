<script setup lang="ts">
import { ref, computed } from 'vue'
import { api } from '@/lib/api'
import { useAccountStore } from '@/stores/account'
import { getUndoExpiresAt } from '@/composables/usePendingSend'
import AsyncButton from '@/components/ui/AsyncButton.vue'
import type { Thread, Signal } from '@/types/server'

const accountStore = useAccountStore()

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
  const result = await api.patchSignal(accountId, signal.value.signalId, { status: 'draft' })
  if (result.isOk()) signal.value = result.value
}

async function reprocess() {
  if (!signal.value) return
  const accountId = accountStore.accountId
  if (!accountId) return

  // Store previous versions
  previousSignal.value = structuredClone(signal.value)
  previousThread.value = thread.value ? structuredClone(thread.value) : null

  reprocessing.value = true
  const result = await api.reprocessSignal(accountId, signal.value.signalId)
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

  const signalResult = await api.getSignal(accountId, id)
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
  const rawResult = await api.getRawEmail(accountId, id)
  if (rawResult.isOk()) {
    rawEmail.value = rawResult.value
  }

  loading.value = false
}
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-6 p-6">
    <h1 class="text-lg font-semibold text-ctp-text">Admin — Signal Inspector</h1>

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
  </div>
</template>

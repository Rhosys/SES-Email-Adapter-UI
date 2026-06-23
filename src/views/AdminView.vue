<script setup lang="ts">
import { ref, computed } from 'vue'
import { api } from '@/lib/api'
import { useAccountStore } from '@/stores/account'
import type { Arc, Signal } from '@/types/server'

const accountStore = useAccountStore()

const signalIdInput = ref('')
const loading = ref(false)
const errorMessage = ref<string | null>(null)

const signal = ref<Signal | null>(null)
const arc = ref<Arc | null>(null)
const rawEmail = ref<string | null>(null)

const htmlBody = computed(() => {
  if (!signal.value) return null
  if (signal.value.type !== 'email') return null
  return (signal.value.data as { body?: string }).body ?? null
})

async function lookup() {
  const id = signalIdInput.value.trim()
  if (!id) return
  const accountId = accountStore.accountId
  if (!accountId) return

  loading.value = true
  errorMessage.value = null
  signal.value = null
  arc.value = null
  rawEmail.value = null

  const signalResult = await api.getSignal(accountId, id)
  if (signalResult.isErr()) {
    errorMessage.value = signalResult.error.message
    loading.value = false
    return
  }
  signal.value = signalResult.value

  // Fetch arc if signal belongs to one
  if (signalResult.value.arcId) {
    const arcResult = await api.getArc(accountId, signalResult.value.arcId)
    if (arcResult.isOk()) {
      arc.value = arcResult.value
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
      <input
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

    <!-- Arc JSON -->
    <section v-if="arc">
      <h2 class="mb-2 text-sm font-medium text-ctp-subtext1">Arc</h2>
      <pre class="overflow-x-auto rounded-lg border border-ctp-surface1 bg-ctp-mantle p-4 text-xs text-ctp-text">{{ JSON.stringify(arc, null, 2) }}</pre>
    </section>
    <section v-else-if="signal && !signal.arcId">
      <h2 class="mb-2 text-sm font-medium text-ctp-subtext1">Arc</h2>
      <p class="text-sm text-ctp-subtext0">No arc — signal has no arcId.</p>
    </section>

    <!-- Signal JSON -->
    <section v-if="signal">
      <h2 class="mb-2 text-sm font-medium text-ctp-subtext1">Signal</h2>
      <pre class="overflow-x-auto rounded-lg border border-ctp-surface1 bg-ctp-mantle p-4 text-xs text-ctp-text">{{ JSON.stringify(signal, null, 2) }}</pre>
    </section>

    <!-- Raw email -->
    <section v-if="rawEmail">
      <h2 class="mb-2 text-sm font-medium text-ctp-subtext1">Raw Email</h2>
      <pre class="overflow-x-auto rounded-lg border border-ctp-surface1 bg-ctp-mantle p-4 text-xs text-ctp-text whitespace-pre-wrap break-all">{{ rawEmail }}</pre>
    </section>

    <!-- HTML body rendered -->
    <section v-if="htmlBody">
      <h2 class="mb-2 text-sm font-medium text-ctp-subtext1">Rendered HTML</h2>
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

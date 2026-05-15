<script setup lang="ts">
import { onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAccountStore } from '@/stores/account'
import { useQuarantineStore } from '@/stores/quarantine'
import { useRelativeTime } from '@/composables/useRelativeTime'
import QuarantineFilters from '@/components/QuarantineFilters.vue'
import QuarantineRow from '@/components/QuarantineRow.vue'
import type { QuarantineFilters as Filters } from '@/stores/quarantine'

const route = useRoute()
const router = useRouter()
const accountStore = useAccountStore()
const store = useQuarantineStore()
useRelativeTime()

onMounted(async () => {
  await accountStore.fetchAccount()
  // Hydrate filters from URL on initial load
  const { sender, after, before } = route.query
  store.setFilters({
    sender: String(sender || ''),
    after: String(after || ''),
    before: String(before || ''),
  })
  await store.fetchSignals(true)
})

watch(
  () => ({ ...store.filters }),
  async (filters) => {
    // Keep URL in sync with current filter state
    const query: Record<string, string> = {}
    if (filters.sender) query.sender = filters.sender
    if (filters.after) query.after = filters.after
    if (filters.before) query.before = filters.before
    void router.replace({ query })
    await store.fetchSignals(true)
  },
  { deep: true },
)

function onUpdateFilters(next: Partial<Filters>) {
  store.setFilters(next)
}

async function onAllow(signalId: string) {
  await store.allow(signalId)
}

async function onReject(signalId: string) {
  await store.reject(signalId)
}

async function onRejectForAlias(signalId: string, toAddress: string, fromAddress: string) {
  await store.rejectForAlias(signalId, toAddress, fromAddress)
}

async function loadMore() {
  await store.fetchMore()
}
</script>

<template>
  <div>
    <header class="border-b border-ctp-surface0 bg-ctp-mantle px-4 py-3">
      <h1 class="text-lg font-semibold">Quarantine</h1>
      <p class="mt-0.5 text-xs text-ctp-subtext0">
        Held emails that need your decision — allow, reject, or create a rule
      </p>
    </header>

    <QuarantineFilters :filters="store.filters" @update="onUpdateFilters" />

    <main class="mx-auto max-w-4xl">
      <!-- Error -->
      <div
        v-if="store.error"
        class="mx-4 mt-4 rounded-lg border border-ctp-red bg-ctp-red/10 px-4 py-3 text-sm text-ctp-red"
      >
        {{ store.error }}
        <button class="ml-2 underline" @click="store.clearError()">Dismiss</button>
      </div>

      <!-- Loading -->
      <div v-if="store.loading" class="py-20 text-center text-sm text-ctp-subtext0">Loading…</div>

      <!-- Empty -->
      <div
        v-else-if="!store.loading && store.items.length === 0"
        class="py-20 text-center text-ctp-subtext0"
      >
        <p class="text-base">No quarantined emails</p>
        <p class="mt-1 text-sm">Everything is clear, or try adjusting your filters.</p>
      </div>

      <!-- List -->
      <div v-else role="list" aria-label="Quarantined emails">
        <QuarantineRow
          v-for="signal in store.items"
          :key="signal.id"
          :signal="signal"
          :pending="store.actionPending.has(signal.id)"
          @allow="onAllow"
          @reject="onReject"
          @reject-for-alias="onRejectForAlias"
        />
      </div>

      <!-- Load more -->
      <div v-if="store.hasMore" class="flex justify-center py-4">
        <button
          :disabled="store.loadingMore"
          class="rounded bg-ctp-surface0 px-4 py-2 text-sm text-ctp-text hover:bg-ctp-surface1 disabled:opacity-50"
          @click="loadMore"
        >
          {{ store.loadingMore ? 'Loading…' : 'Load more' }}
        </button>
      </div>
    </main>
  </div>
</template>

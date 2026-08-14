<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useQuarantineStore } from '@/stores/quarantine'
import { useRelativeTime } from '@/composables/useRelativeTime'
import QuarantineFilters from '@/components/QuarantineFilters.vue'
import QuarantineRow from '@/components/QuarantineRow.vue'
import type { QuarantineFilters as Filters } from '@/stores/quarantine'

const route = useRoute()
const router = useRouter()
const store = useQuarantineStore()
useRelativeTime()

const loading = ref(true)
const loadingMore = ref(false)

const hasData = computed(
  () => store.quarantineVisible.length > 0 || store.quarantineHidden.length > 0,
)

const filters = ref<Filters>(filtersFromQuery())

function filtersFromQuery(): Filters {
  const { sender, after, before } = route.query
  return {
    sender: String(sender || ''),
    after: String(after || ''),
    before: String(before || ''),
  }
}

async function doFetch() {
  if (hasData.value) loading.value = false
  await store.fetchSignals(filters.value)
  loading.value = false
}

onMounted(async () => {
  await doFetch()
})

async function onUpdateFilters(next: Partial<Filters>) {
  filters.value = { ...filters.value, ...next }
  const query: Record<string, string> = {}
  if (filters.value.sender) query.sender = filters.value.sender
  if (filters.value.after) query.after = filters.value.after
  if (filters.value.before) query.before = filters.value.before
  void router.replace({ query })
  await doFetch()
}

async function loadMore() {
  if (loadingMore.value) return
  loadingMore.value = true
  await store.fetchMore(filters.value)
  loadingMore.value = false
}
</script>

<template>
  <div>
    <header class="border-b border-ctp-surface0 bg-ctp-mantle px-4 py-3">
      <h1 class="hidden text-lg font-semibold sm:block">Quarantine</h1>
      <p class="mt-0.5 text-xs text-ctp-subtext0">
        Held emails that need your decision — allow, reject, or create a rule
      </p>
    </header>

    <QuarantineFilters :filters="filters" @update="onUpdateFilters" />

    <main class="mx-auto max-w-4xl">
      <!-- Error -->
      <div
        v-if="store.error"
        class="mx-4 mt-4 rounded-lg border border-ctp-red bg-ctp-red/10 px-4 py-3 text-sm text-ctp-red"
      >
        {{ store.error }}
        <button class="ml-2 underline" @click="store.clearError()">Dismiss</button>
      </div>

      <!-- Data -->
      <template v-if="hasData">
        <!-- Needs review (quarantine_visible) -->
        <section v-if="store.quarantineVisible.length > 0" aria-label="Needs review">
          <div
            class="flex items-center gap-2 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-ctp-subtext0"
          >
            <span>Needs review</span>
            <span class="rounded-full bg-ctp-peach/20 px-1.5 py-0.5 text-ctp-peach">
              {{ store.quarantineVisible.length }}
            </span>
          </div>
          <TransitionGroup name="list" tag="div" role="list" aria-label="Emails needing review" class="relative">
            <QuarantineRow
              v-for="signal in store.quarantineVisible"
              :key="signal.signalId"
              :signal="signal"
              :pending="store.actionPending.has(signal.signalId)"
            />
          </TransitionGroup>
        </section>

        <!-- Silently held (quarantine_hidden) -->
        <section
          v-if="store.quarantineHidden.length > 0"
          :class="{ 'mt-6': store.quarantineVisible.length > 0 }"
          aria-label="Silently held"
        >
          <div
            class="flex items-center gap-2 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-ctp-subtext0"
          >
            <span>Silently held</span>
            <span class="rounded-full bg-ctp-surface1 px-1.5 py-0.5 text-ctp-subtext0">
              {{ store.quarantineHidden.length }}
            </span>
            <span class="font-normal normal-case text-ctp-subtext0">
              — accepted by your server but not delivered
            </span>
          </div>
          <p class="px-4 pb-2 text-xs text-ctp-subtext0">
            These arrived from senders whose domain matched a block rule. They were accepted
            silently so the sender doesn't know they were filtered.
          </p>
          <TransitionGroup name="list" tag="div" role="list" aria-label="Silently held emails" class="relative">
            <QuarantineRow
              v-for="signal in store.quarantineHidden"
              :key="signal.signalId"
              :signal="signal"
              :pending="store.actionPending.has(signal.signalId)"
            />
          </TransitionGroup>
        </section>

        <!-- Load more -->
        <div v-if="store.hasMore" class="flex justify-center py-6">
          <button
            :disabled="loadingMore"
            class="rounded bg-ctp-surface0 px-4 py-2 text-sm text-ctp-text hover:bg-ctp-surface1 disabled:opacity-50"
            @click="loadMore"
          >
            {{ loadingMore ? 'Loading…' : 'Load more' }}
          </button>
        </div>
      </template>

      <!-- Skeleton -->
      <div
        v-else-if="loading"
        role="status"
        aria-label="Loading quarantine…"
        class="animate-pulse divide-y divide-ctp-surface0 rounded-lg border border-ctp-surface0"
      >
        <div v-for="i in 5" :key="i" class="flex items-center gap-3 px-4 py-3">
          <div class="flex-1 space-y-1.5">
            <div class="h-4 rounded bg-ctp-surface1" :style="{ width: `${50 + (i * 13) % 35}%` }" />
            <div class="h-3 w-32 rounded bg-ctp-surface1" />
          </div>
          <div class="h-7 w-16 shrink-0 rounded bg-ctp-surface1" />
          <div class="h-7 w-14 shrink-0 rounded bg-ctp-surface1" />
        </div>
      </div>

      <!-- Empty -->
      <div v-else class="py-20 text-center text-ctp-subtext0">
        <p class="text-base font-medium text-ctp-text">No emails waiting for review</p>
        <p class="mx-auto mt-2 max-w-sm text-sm">
          When a new sender writes to you, their email waits here — you decide whether to let them
          through or block them for good. Nothing has arrived yet, or you've already reviewed
          everything.
        </p>
      </div>
    </main>
  </div>
</template>

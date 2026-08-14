<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSpamStore } from '@/stores/spam'
import { useRelativeTime } from '@/composables/useRelativeTime'
import QuarantineFilters from '@/components/QuarantineFilters.vue'
import QuarantineRow from '@/components/QuarantineRow.vue'
import type { SpamFilters } from '@/stores/spam'

const route = useRoute()
const router = useRouter()
const store = useSpamStore()
useRelativeTime()

const loading = ref(true)
const loadingMore = ref(false)

const hasData = computed(
  () => store.blockHidden.length > 0 || store.blockReject.length > 0,
)

const filters = ref<SpamFilters>(filtersFromQuery())

function filtersFromQuery(): SpamFilters {
  const { sender, after, before } = route.query
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  return {
    sender: String(sender || ''),
    after: String(after || fourteenDaysAgo),
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

async function onUpdateFilters(next: Partial<SpamFilters>) {
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
      <h1 class="hidden text-lg font-semibold sm:block">Spam</h1>
      <p class="mt-0.5 text-xs text-ctp-subtext0">
        Emails blocked by rules or sender policy — silently dropped or rejected
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
        <!-- Silently blocked (block_hidden) -->
        <section v-if="store.blockHidden.length > 0" aria-label="Silently blocked">
          <div
            class="flex items-center gap-2 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-ctp-subtext0"
          >
            <span>Silently blocked</span>
            <span class="rounded-full bg-ctp-surface1 px-1.5 py-0.5 text-ctp-subtext0">
              {{ store.blockHidden.length }}
            </span>
            <span class="font-normal normal-case text-ctp-subtext0">
              — accepted but silently discarded
            </span>
          </div>
          <TransitionGroup name="list" tag="div" role="list" aria-label="Silently blocked emails" class="relative">
            <QuarantineRow
              v-for="signal in store.blockHidden"
              :key="signal.signalId"
              :signal="signal"
              :pending="store.actionPending.has(signal.signalId)"
              route-name="spam-detail"
            />
          </TransitionGroup>
        </section>

        <!-- Rejected (block_reject) -->
        <section
          v-if="store.blockReject.length > 0"
          :class="{ 'mt-6': store.blockHidden.length > 0 }"
          aria-label="Rejected"
        >
          <div
            class="flex items-center gap-2 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-ctp-subtext0"
          >
            <span>Rejected</span>
            <span class="rounded-full bg-ctp-red/20 px-1.5 py-0.5 text-ctp-red">
              {{ store.blockReject.length }}
            </span>
            <span class="font-normal normal-case text-ctp-subtext0">
              — sender received a bounce notification
            </span>
          </div>
          <TransitionGroup name="list" tag="div" role="list" aria-label="Rejected emails" class="relative">
            <QuarantineRow
              v-for="signal in store.blockReject"
              :key="signal.signalId"
              :signal="signal"
              :pending="store.actionPending.has(signal.signalId)"
              route-name="spam-detail"
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
        aria-label="Loading blocked emails…"
        class="animate-pulse divide-y divide-ctp-surface0 rounded-lg border border-ctp-surface0"
      >
        <div v-for="i in 5" :key="i" class="flex items-center gap-3 px-4 py-3">
          <div class="flex-1 space-y-1.5">
            <div class="h-4 rounded bg-ctp-surface1" :style="{ width: `${50 + (i * 13) % 35}%` }" />
            <div class="h-3 w-32 rounded bg-ctp-surface1" />
          </div>
        </div>
      </div>

      <!-- Empty -->
      <div v-else class="py-20 text-center text-ctp-subtext0">
        <p class="text-base font-medium text-ctp-text">No blocked emails</p>
        <p class="mx-auto mt-2 max-w-sm text-sm">
          Emails blocked by your rules or sender policy appear here. Nothing has been blocked yet.
        </p>
      </div>
    </main>
  </div>
</template>

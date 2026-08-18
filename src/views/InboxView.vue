<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useThreadsStore } from '@/stores/threads'
import { useThreadListQuery, useArchiveThread, useBulkArchive, useBulkMoveToInbox, useBulkLabel } from '@/composables/useThreadQueries'
import { usePrefetchThreadSignals } from '@/composables/useSignalQueries'
import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts'
import { useIsMobile } from '@/composables/useIsMobile'
import { useDeferredHide } from '@/composables/useDeferredHide'
import InboxTabBar from '@/components/InboxTabBar.vue'
import BulkActionBar from '@/components/BulkActionBar.vue'
import ThreadListShell from '@/components/ThreadListShell.vue'
import ActiveThreadRow from '@/components/ActiveThreadRow.vue'
import ArchivedThreadRow from '@/components/ArchivedThreadRow.vue'
import AllThreadRow from '@/components/AllThreadRow.vue'
import InboxError from '@/components/InboxError.vue'
import InboxEmpty from '@/components/InboxEmpty.vue'
import InboxZeroCelebration from '@/components/InboxZeroCelebration.vue'
import StatsWidget from '@/components/StatsWidget.vue'
import ResourcesBanner from '@/components/ResourcesBanner.vue'
import type { ThreadStatus } from '@/types/server'

const route = useRoute()
const router = useRouter()
const threadsStore = useThreadsStore()
const { prefetch: prefetchSignals } = usePrefetchThreadSignals()
const { onAction, offAction } = useKeyboardShortcuts()
const { hiddenIds } = useDeferredHide()
const isMobile = useIsMobile()

const RECENCY_WINDOW_MS = 15 * 60 * 1000

const refreshing = ref(false)
const lastRefreshedAt = ref<string | null>(null)

const VALID_TABS = ['active', 'archived', 'all'] as const
type TabKey = (typeof VALID_TABS)[number]

const activeTab = ref<TabKey>('active')

/** Undefined asks the server for every status — the "All" tab. */
function statusFor(tab: TabKey): ThreadStatus | undefined {
  return tab === 'all' ? undefined : tab
}

// TanStack Query — thread list driven by current tab
const { query: threadListQuery, threads: allThreads, hasMore } = useThreadListQuery(
  () => statusFor(activeTab.value),
)

// Dedicated active-thread count for the badge (tab-independent). TanStack Query
// deduplicates: when the active tab is 'active', both share the same cache entry.
const { activeCount: badgeActiveCount, hasMore: badgeHasMore } = useThreadListQuery(() => 'active')

const archiveMutation = useArchiveThread()
const bulkArchiveMutation = useBulkArchive()
const bulkMoveToInboxMutation = useBulkMoveToInbox()
const bulkLabelMutation = useBulkLabel()

const loading = computed(() => threadListQuery.isLoading.value)
const error = computed(() => threadListQuery.error.value?.message ?? null)

// Filter out threads that are optimistically hidden (deferred delete/block pending)
const visibleItems = computed(() => allThreads.value.filter((t) => !hiddenIds.value.has(t.threadId)))

const allSelected = computed(
  () => visibleItems.value.length > 0 && visibleItems.value.every((t) => threadsStore.selectedIds.has(t.threadId)),
)

async function fetchRecentSignals() {
  const now = Date.now()
  const recentThreads = allThreads.value
    .filter(t => t.lastSignalAt && now - new Date(t.lastSignalAt).getTime() < RECENCY_WINDOW_MS)
    .map(t => ({ threadId: t.threadId, lastSignalAt: t.lastSignalAt! }))
  if (recentThreads.length > 0) {
    await prefetchSignals(recentThreads)
  }
}

async function handleRefresh() {
  refreshing.value = true
  await threadListQuery.refetch()
  await fetchRecentSignals()
  lastRefreshedAt.value = new Date().toLocaleTimeString()
  refreshing.value = false
}

// Keyboard-navigable cursor through the thread list
const focusedThreadId = ref<string | null>(null)

function scrollFocusedIntoView() {
  if (!focusedThreadId.value) return
  document
    .querySelector(`[data-thread-id="${focusedThreadId.value}"]`)
    ?.scrollIntoView({ block: 'nearest' })
}

function moveNext() {
  const items = visibleItems.value
  if (!items.length) return
  const idx = items.findIndex((a) => a.threadId === focusedThreadId.value)
  focusedThreadId.value = items[Math.min(idx + 1, items.length - 1)].threadId
  scrollFocusedIntoView()
}

function movePrev() {
  const items = visibleItems.value
  if (!items.length) return
  const idx = items.findIndex((a) => a.threadId === focusedThreadId.value)
  focusedThreadId.value = items[Math.max(idx <= 0 ? 0 : idx - 1, 0)].threadId
  scrollFocusedIntoView()
}

function openFocused() {
  if (!focusedThreadId.value) return
  void router.push({ name: 'thread-detail', params: { id: focusedThreadId.value } })
}

function archiveFocused() {
  if (!focusedThreadId.value) return
  archiveMutation.mutate(focusedThreadId.value)
}

function selectFocused() {
  if (!focusedThreadId.value) return
  threadsStore.toggleSelect(focusedThreadId.value)
}

onMounted(() => {
  const tab = route.query.tab as TabKey | undefined
  if (tab && (VALID_TABS as readonly string[]).includes(tab)) activeTab.value = tab

  onAction('navigate_next', moveNext)
  onAction('navigate_prev', movePrev)
  onAction('open_thread', openFocused)
  onAction('archive', archiveFocused)
  onAction('select_toggle', selectFocused)
})

onUnmounted(() => {
  offAction('navigate_next', moveNext)
  offAction('navigate_prev', movePrev)
  offAction('open_thread', openFocused)
  offAction('archive', archiveFocused)
  offAction('select_toggle', selectFocused)
})

function handleTabChange(tab: TabKey) {
  activeTab.value = tab
  threadsStore.clearSelection()
  void router.replace({ query: tab === 'active' ? {} : { tab } })
}

function handleLoadMore() {
  void threadListQuery.fetchNextPage()
}

function handleBulkArchive() {
  const ids = [...threadsStore.selectedIds]
  threadsStore.clearSelection()
  return bulkArchiveMutation.mutateAsync(ids)
}

function handleBulkMoveToInbox() {
  const ids = [...threadsStore.selectedIds]
  threadsStore.clearSelection()
  return bulkMoveToInboxMutation.mutateAsync(ids)
}

function handleBulkLabel(label: string) {
  const ids = [...threadsStore.selectedIds]
  return bulkLabelMutation.mutateAsync({ threadIds: ids, label, threads: allThreads.value })
}

// Inbox zero celebration — fires only when active tab transitions from items → 0
const showCelebration = ref(false)
let prevActiveCount = -1

watch(
  [() => loading.value, () => visibleItems.value.length, () => activeTab.value],
  ([isLoading, count, tab]) => {
    if (isLoading) return
    if (tab === 'active') {
      if (prevActiveCount > 0 && count === 0) showCelebration.value = true
      prevActiveCount = count
    } else {
      prevActiveCount = -1
    }
  },
)
</script>

<template>
  <div class="inbox-view">
    <header class="hidden border-b border-ctp-surface0 bg-ctp-mantle px-4 py-3 sm:block">
      <div class="flex items-center justify-between">
        <h1 class="text-lg font-semibold">Inbox</h1>
        <div class="flex items-center gap-2">
          <span v-if="lastRefreshedAt" class="text-xs text-ctp-subtext0">Last checked: {{ lastRefreshedAt }}</span>
          <button
            class="flex items-center gap-1 rounded border border-ctp-surface1 px-2 py-1 text-xs text-ctp-subtext1 transition-colors hover:border-ctp-blue hover:text-ctp-blue disabled:opacity-50"
            :disabled="refreshing"
            @click="handleRefresh"
          >
            <svg
              class="h-3.5 w-3.5"
              :class="{ 'animate-spin': refreshing }"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              aria-hidden="true"
            >
              <path d="M14 8A6 6 0 1 1 8 2" stroke-linecap="round" />
              <path d="M8 0v4l3-2" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            Refresh
          </button>
        </div>
      </div>
    </header>

    <!-- pb-24 on mobile clears the fixed InboxTabBar bottom bar -->
    <main class="mx-auto max-w-4xl px-4 pt-4 pb-24 sm:pb-4">
      <StatsWidget class="hidden sm:block" />
      <ResourcesBanner />

      <InboxError v-if="error" :message="error" />

      <InboxTabBar
        :active-tab="activeTab"
        :active-count="badgeActiveCount"
        :active-count-has-more="badgeHasMore"
        @change="handleTabChange"
      />

      <BulkActionBar
        v-if="threadsStore.selectedIds.size > 0 || !isMobile"
        :count="threadsStore.selectedIds.size"
        :pending="threadsStore.bulkActionPending"
        :all-selected="allSelected"
        :tab="activeTab"
        :archive-action="handleBulkArchive"
        :move-to-inbox-action="handleBulkMoveToInbox"
        :label-action="handleBulkLabel"
        @select-all="threadsStore.selectAll(visibleItems.map((t) => t.threadId))"
        @clear-selection="threadsStore.clearSelection()"
        @clear="threadsStore.clearSelection()"
      />

      <ThreadListShell
        v-if="visibleItems.length > 0"
      >
        <template v-if="activeTab === 'active'">
          <ActiveThreadRow
            v-for="thread in visibleItems"
            :key="thread.threadId"
            :thread="thread"
            :selected="threadsStore.selectedIds.has(thread.threadId)"
            :focused="thread.threadId === focusedThreadId"
            @toggle-select="threadsStore.toggleSelect"
          />
        </template>
        <template v-else-if="activeTab === 'archived'">
          <ArchivedThreadRow
            v-for="thread in visibleItems"
            :key="thread.threadId"
            :thread="thread"
            :selected="threadsStore.selectedIds.has(thread.threadId)"
            :focused="thread.threadId === focusedThreadId"
            @toggle-select="threadsStore.toggleSelect"
          />
        </template>
        <template v-else>
          <AllThreadRow
            v-for="thread in visibleItems"
            :key="thread.threadId"
            :thread="thread"
            :selected="threadsStore.selectedIds.has(thread.threadId)"
            :focused="thread.threadId === focusedThreadId"
            @toggle-select="threadsStore.toggleSelect"
          />
        </template>
      </ThreadListShell>

      <div
        v-else-if="loading"
        role="status"
        aria-label="Loading inbox…"
        class="inbox-skeleton-loader animate-pulse divide-y divide-ctp-surface0"
      >
        <div v-for="i in 8" :key="i" class="flex items-center gap-3 px-3 py-3">
          <div class="ml-2 h-4 w-4 shrink-0 rounded bg-ctp-surface1" />
          <div class="h-5 w-5 shrink-0 rounded bg-ctp-surface1" />
          <div class="flex-1 space-y-1.5">
            <div class="h-4 rounded bg-ctp-surface1" :style="{ width: `${48 + (i * 11) % 38}%` }" />
            <div class="h-3 w-24 rounded bg-ctp-surface1" />
          </div>
          <div class="h-3 w-10 shrink-0 rounded bg-ctp-surface1" />
        </div>
      </div>

      <InboxEmpty
        v-else
        :tab="activeTab"
        :refreshing="refreshing"
        :last-refreshed-at="lastRefreshedAt"
        @refresh="handleRefresh"
      />

      <div v-if="hasMore" class="mt-4 flex justify-center">
        <button
          :disabled="threadListQuery.isFetchingNextPage.value"
          class="rounded bg-ctp-surface0 px-4 py-2 text-sm text-ctp-text hover:bg-ctp-surface1 disabled:opacity-50"
          @click="handleLoadMore"
        >
          {{ threadListQuery.isFetchingNextPage.value ? 'Loading…' : 'Load more' }}
        </button>
      </div>
    </main>
  </div>

  <InboxZeroCelebration :show="showCelebration" @done="showCelebration = false" />
</template>

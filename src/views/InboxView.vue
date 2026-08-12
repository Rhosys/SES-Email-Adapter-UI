<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useThreadsStore } from '@/stores/threads'
import { useSignalsStore } from '@/stores/signals'
import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts'
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
import type { FetchThreadsOptions } from '@/stores/threads'
import type { ThreadStatus } from '@/types/server'

const route = useRoute()
const router = useRouter()
const threadsStore = useThreadsStore()
const signalsStore = useSignalsStore()
const { onAction, offAction } = useKeyboardShortcuts()
const { hiddenIds } = useDeferredHide()

const RECENCY_WINDOW_MS = 15 * 60 * 1000

const refreshing = ref(false)
const loading = ref(true)
const lastRefreshedAt = ref<string | null>(null)

async function fetchRecentSignals() {
  const now = Date.now()
  const recentThreads = threadsStore.sortedThreads
    .filter(t => t.lastSignalAt && now - new Date(t.lastSignalAt).getTime() < RECENCY_WINDOW_MS)
    .map(t => ({ threadId: t.threadId, lastSignalAt: t.lastSignalAt! }))
  if (recentThreads.length > 0) {
    await signalsStore.fetchForThreads(recentThreads)
  }
}


const VALID_TABS = ['active', 'archived', 'all'] as const
type TabKey = (typeof VALID_TABS)[number]

const activeTab = ref<TabKey>('active')

/** Undefined asks the server for every status — the "All" tab. */
function statusFor(tab: TabKey): ThreadStatus | undefined {
  return tab === 'all' ? undefined : tab
}

/** The query a tab reads. Filters, when the inbox grows them, belong here too. */
function queryFor(tab: TabKey): FetchThreadsOptions {
  return { status: statusFor(tab) }
}

/**
 * A cursor is a position within one query's results and means nothing to a different
 * query, so cursors are held per query rather than per tab. Today the tab is the whole
 * query, giving one cursor per tab; anything added to `queryFor` — filters, a search
 * term — changes the identity too, so a changed query can never continue paging through
 * the old one's results. A page landing late updates the query that asked for it and no
 * other. Set means that query has more pages.
 */
const cursors = ref<Record<string, string | undefined>>({})

function cursorKey(query: FetchThreadsOptions) {
  return JSON.stringify(query)
}

const hasMore = computed(() => cursors.value[cursorKey(queryFor(activeTab.value))] !== undefined)

const tabThreads = computed(() =>
  activeTab.value === 'all'
    ? threadsStore.sortedThreads
    : threadsStore.threadsWithStatus(activeTab.value),
)

// Filter out threads that are optimistically hidden (deferred delete/block pending)
const visibleItems = computed(() => tabThreads.value.filter((t) => !hiddenIds.value.has(t.threadId)))

const allSelected = computed(
  () => visibleItems.value.length > 0 && visibleItems.value.every((t) => threadsStore.selectedIds.has(t.threadId)),
)

/**
 * Read a tab's listing from the beginning. Selecting a tab always starts a fresh query
 * — the cursor it held is dropped first, so a stale one can never be sent — and the
 * cursor that query returns takes its place.
 */
async function loadTab(tab: TabKey, refresh = false) {
  const query = queryFor(tab)
  const key = cursorKey(query)
  cursors.value = { ...cursors.value, [key]: undefined }
  // Skip skeleton if the store already has items for this tab
  if (tabThreads.value.length > 0) loading.value = false
  const cursor = await threadsStore.fetchThreads({ ...query, refresh })
  loading.value = false
  cursors.value = { ...cursors.value, [key]: cursor }
}

async function handleRefresh() {
  refreshing.value = true
  await loadTab(activeTab.value, true)
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

async function archiveFocused() {
  if (!focusedThreadId.value) return
  await threadsStore.archiveThread(focusedThreadId.value)
}

function selectFocused() {
  if (!focusedThreadId.value) return
  threadsStore.toggleSelect(focusedThreadId.value)
}

onMounted(async () => {
  const tab = route.query.tab as TabKey | undefined
  if (tab && (VALID_TABS as readonly string[]).includes(tab)) activeTab.value = tab
  await loadTab(activeTab.value)

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
  void loadTab(tab)
  void router.replace({ query: tab === 'active' ? {} : { tab } })
}

async function handleLoadMore() {
  const query = queryFor(activeTab.value)
  const key = cursorKey(query)
  const cursor = cursors.value[key]
  if (cursor === undefined || threadsStore.loadingMore) return
  const next = await threadsStore.fetchThreads({ ...query, cursor })
  cursors.value = { ...cursors.value, [key]: next }
}

async function handleBulkArchive() {
  await threadsStore.bulkArchive()
}

async function handleBulkMoveToInbox() {
  await threadsStore.bulkMoveToInbox()
}

async function handleBulkLabel(label: string) {
  await threadsStore.bulkLabel(label)
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
      <StatsWidget />
      <ResourcesBanner />

      <InboxError v-if="threadsStore.error" :message="threadsStore.error" />

      <InboxTabBar
        :active-tab="activeTab"
        :active-count="threadsStore.activeCount"
        :active-count-has-more="threadsStore.activeCountHasMore"
        @change="handleTabChange"
      />

      <BulkActionBar
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
          :disabled="threadsStore.loadingMore"
          class="rounded bg-ctp-surface0 px-4 py-2 text-sm text-ctp-text hover:bg-ctp-surface1 disabled:opacity-50"
          @click="handleLoadMore"
        >
          {{ threadsStore.loadingMore ? 'Loading…' : 'Load more' }}
        </button>
      </div>
    </main>
  </div>

  <InboxZeroCelebration :show="showCelebration" @done="showCelebration = false" />
</template>

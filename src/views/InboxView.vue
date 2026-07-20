<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useThreadsStore } from '@/stores/threads'
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

const route = useRoute()
const router = useRouter()
const threadsStore = useThreadsStore()
const { onAction, offAction } = useKeyboardShortcuts()
const { hiddenIds } = useDeferredHide()

const VALID_TABS = ['active', 'archived', 'all'] as const
type TabKey = (typeof VALID_TABS)[number]

// Filter out threads that are optimistically hidden (deferred delete/block pending)
const visibleItems = computed(() =>
  threadsStore.sortedItems.filter((t) => !hiddenIds.value.has(t.threadId)),
)

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
  if (tab && (VALID_TABS as readonly string[]).includes(tab)) threadsStore.setTab(tab)
  await threadsStore.fetchThreads(true)

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
  threadsStore.setTab(tab)
  void router.replace({ query: tab === 'active' ? {} : { tab } })
}

function handleLoadMore() {
  void threadsStore.fetchMoreThreads()
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
  [() => threadsStore.loading, () => visibleItems.value.length, () => threadsStore.activeTab],
  ([loading, count, tab]) => {
    if (loading) return
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
      <h1 class="text-lg font-semibold">Inbox</h1>
    </header>

    <!-- pb-24 on mobile clears the fixed InboxTabBar bottom bar -->
    <main class="mx-auto max-w-4xl px-4 pt-4 pb-24 sm:pb-4">
      <StatsWidget />

      <InboxError v-if="threadsStore.error" :message="threadsStore.error" />

      <InboxTabBar
        :active-tab="threadsStore.activeTab"
        :active-count="threadsStore.activeCount"
        :active-count-has-more="threadsStore.activeCountHasMore"
        @change="handleTabChange"
      />

      <BulkActionBar
        :count="threadsStore.selectedIds.size"
        :pending="threadsStore.bulkActionPending"
        :all-selected="threadsStore.allSelected"
        :tab="threadsStore.activeTab"
        :archive-action="handleBulkArchive"
        :move-to-inbox-action="handleBulkMoveToInbox"
        :label-action="handleBulkLabel"
        @select-all="threadsStore.selectAll()"
        @clear-selection="threadsStore.clearSelection()"
        @clear="threadsStore.clearSelection()"
      />

      <ThreadListShell
        v-if="visibleItems.length > 0"
      >
        <template v-if="threadsStore.activeTab === 'active'">
          <ActiveThreadRow
            v-for="thread in visibleItems"
            :key="thread.threadId"
            :thread="thread"
            :selected="threadsStore.selectedIds.has(thread.threadId)"
            :focused="thread.threadId === focusedThreadId"
            @toggle-select="threadsStore.toggleSelect"
          />
        </template>
        <template v-else-if="threadsStore.activeTab === 'archived'">
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
        v-else-if="threadsStore.loading"
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
        :tab="threadsStore.activeTab"
      />

      <div v-if="threadsStore.hasMore" class="mt-4 flex justify-center">
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

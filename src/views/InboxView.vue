<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useArcsStore } from '@/stores/arcs'
import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts'
import StatusTabs from '@/components/StatusTabs.vue'
import BulkActionBar from '@/components/BulkActionBar.vue'
import ArcListShell from '@/components/ArcListShell.vue'
import ActiveArcRow from '@/components/ActiveArcRow.vue'
import ArchivedArcRow from '@/components/ArchivedArcRow.vue'
import AllArcRow from '@/components/AllArcRow.vue'
import InboxError from '@/components/InboxError.vue'
import InboxEmpty from '@/components/InboxEmpty.vue'
import InboxZeroCelebration from '@/components/InboxZeroCelebration.vue'
import StatsWidget from '@/components/StatsWidget.vue'

const route = useRoute()
const router = useRouter()
const arcsStore = useArcsStore()
const { onAction, offAction } = useKeyboardShortcuts()

const VALID_TABS = ['active', 'archived', 'all'] as const
type TabKey = (typeof VALID_TABS)[number]

// Keyboard-navigable cursor through the arc list
const focusedArcId = ref<string | null>(null)

function scrollFocusedIntoView() {
  if (!focusedArcId.value) return
  document
    .querySelector(`[data-arc-id="${focusedArcId.value}"]`)
    ?.scrollIntoView({ block: 'nearest' })
}

function moveNext() {
  const items = arcsStore.sortedItems
  if (!items.length) return
  const idx = items.findIndex((a) => a.arcId === focusedArcId.value)
  focusedArcId.value = items[Math.min(idx + 1, items.length - 1)].arcId
  scrollFocusedIntoView()
}

function movePrev() {
  const items = arcsStore.sortedItems
  if (!items.length) return
  const idx = items.findIndex((a) => a.arcId === focusedArcId.value)
  focusedArcId.value = items[Math.max(idx <= 0 ? 0 : idx - 1, 0)].arcId
  scrollFocusedIntoView()
}

function openFocused() {
  if (!focusedArcId.value) return
  void router.push({ name: 'arc-detail', params: { id: focusedArcId.value } })
}

async function archiveFocused() {
  if (!focusedArcId.value) return
  await arcsStore.archiveArc(focusedArcId.value)
}

function selectFocused() {
  if (!focusedArcId.value) return
  arcsStore.toggleSelect(focusedArcId.value)
}

onMounted(async () => {
  const tab = route.query.tab as TabKey | undefined
  if (tab && (VALID_TABS as readonly string[]).includes(tab)) arcsStore.setTab(tab)
  await arcsStore.fetchArcs(true)

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
  arcsStore.setTab(tab)
  void router.replace({ query: tab === 'active' ? {} : { tab } })
}

function handleLoadMore() {
  void arcsStore.fetchMoreArcs()
}

async function handleBulkArchive() {
  await arcsStore.bulkArchive()
}

async function handleBulkMoveToInbox() {
  await arcsStore.bulkMoveToInbox()
}

async function handleBulkLabel(label: string) {
  await arcsStore.bulkLabel(label)
}

// Inbox zero celebration — fires only when active tab transitions from items → 0
const showCelebration = ref(false)
let prevActiveCount = -1

watch(
  [() => arcsStore.loading, () => arcsStore.sortedItems.length, () => arcsStore.activeTab],
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

    <main class="mx-auto max-w-4xl px-4 py-4">
      <StatsWidget />

      <InboxError v-if="arcsStore.error" :message="arcsStore.error" />

      <StatusTabs :active-tab="arcsStore.activeTab" @change="handleTabChange" />

      <BulkActionBar
        :count="arcsStore.selectedIds.size"
        :pending="arcsStore.bulkActionPending"
        :all-selected="arcsStore.allSelected"
        :tab="arcsStore.activeTab"
        :archive-action="handleBulkArchive"
        :move-to-inbox-action="handleBulkMoveToInbox"
        :label-action="handleBulkLabel"
        @select-all="arcsStore.selectAll()"
        @clear-selection="arcsStore.clearSelection()"
        @clear="arcsStore.clearSelection()"
      />

      <ArcListShell
        v-if="arcsStore.sortedItems.length > 0"
      >
        <template v-if="arcsStore.activeTab === 'active'">
          <ActiveArcRow
            v-for="arc in arcsStore.sortedItems"
            :key="arc.arcId"
            :arc="arc"
            :selected="arcsStore.selectedIds.has(arc.arcId)"
            :focused="arc.arcId === focusedArcId"
            @toggle-select="arcsStore.toggleSelect"
          />
        </template>
        <template v-else-if="arcsStore.activeTab === 'archived'">
          <ArchivedArcRow
            v-for="arc in arcsStore.sortedItems"
            :key="arc.arcId"
            :arc="arc"
            :selected="arcsStore.selectedIds.has(arc.arcId)"
            :focused="arc.arcId === focusedArcId"
            @toggle-select="arcsStore.toggleSelect"
          />
        </template>
        <template v-else>
          <AllArcRow
            v-for="arc in arcsStore.sortedItems"
            :key="arc.arcId"
            :arc="arc"
            :selected="arcsStore.selectedIds.has(arc.arcId)"
            :focused="arc.arcId === focusedArcId"
            @toggle-select="arcsStore.toggleSelect"
          />
        </template>
      </ArcListShell>

      <div
        v-else-if="arcsStore.loading"
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
        :tab="arcsStore.activeTab"
      />

      <div v-if="arcsStore.hasMore" class="mt-4 flex justify-center">
        <button
          :disabled="arcsStore.loadingMore"
          class="rounded bg-ctp-surface0 px-4 py-2 text-sm text-ctp-text hover:bg-ctp-surface1 disabled:opacity-50"
          @click="handleLoadMore"
        >
          {{ arcsStore.loadingMore ? 'Loading…' : 'Load more' }}
        </button>
      </div>
    </main>
  </div>

  <InboxZeroCelebration :show="showCelebration" @done="showCelebration = false" />
</template>

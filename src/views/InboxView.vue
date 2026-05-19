<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAccountStore } from '@/stores/account'
import { useArcsStore } from '@/stores/arcs'
import { useOnboardingCoach } from '@/composables/useOnboardingCoach'
import { useRelativeTime } from '@/composables/useRelativeTime'
import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts'
import StatusTabs from '@/components/StatusTabs.vue'
import BulkActionBar from '@/components/BulkActionBar.vue'
import ArcList from '@/components/ArcList.vue'
import InboxError from '@/components/InboxError.vue'
import InboxEmpty from '@/components/InboxEmpty.vue'
import InboxZeroCelebration from '@/components/InboxZeroCelebration.vue'

const route = useRoute()
const router = useRouter()
const accountStore = useAccountStore()
const arcsStore = useArcsStore()
const { countdownRunning, startArcViewCountdown, showCoachNow } = useOnboardingCoach()
const { onAction, offAction } = useKeyboardShortcuts()

useRelativeTime()

const VALID_TABS = ['active', 'archived', 'all'] as const
type TabKey = (typeof VALID_TABS)[number]

// Keyboard-navigable cursor through the arc list
const focusedArcId = ref<string | null>(null)

function coachShouldRun() {
  const ob = accountStore.account?.onboarding
  return ob?.completed && !ob.notificationCoachCompleted
}

function scrollFocusedIntoView() {
  if (!focusedArcId.value) return
  document
    .querySelector(`[data-arc-id="${focusedArcId.value}"]`)
    ?.scrollIntoView({ block: 'nearest' })
}

function moveNext() {
  const items = arcsStore.sortedItems
  if (!items.length) return
  const idx = items.findIndex((a) => a.id === focusedArcId.value)
  focusedArcId.value = items[Math.min(idx + 1, items.length - 1)].id
  scrollFocusedIntoView()
}

function movePrev() {
  const items = arcsStore.sortedItems
  if (!items.length) return
  const idx = items.findIndex((a) => a.id === focusedArcId.value)
  focusedArcId.value = items[Math.max(idx <= 0 ? 0 : idx - 1, 0)].id
  scrollFocusedIntoView()
}

function openFocused() {
  if (!focusedArcId.value) return
  void router.push({ name: 'arc-detail', params: { id: focusedArcId.value } })
}

async function archiveFocused() {
  if (!focusedArcId.value) return
  const accountId = accountStore.accountId
  if (!accountId) return
  const { api } = await import('@/lib/api')
  const result = await api.patchArc(accountId, focusedArcId.value, { status: 'archived' })
  if (result.isOk()) arcsStore.removeArc(focusedArcId.value)
}

function selectFocused() {
  if (!focusedArcId.value) return
  arcsStore.toggleSelect(focusedArcId.value)
}

onMounted(async () => {
  const tab = route.query.tab as TabKey | undefined
  if (tab && (VALID_TABS as readonly string[]).includes(tab)) arcsStore.setTab(tab)
  await accountStore.fetchAccount()
  await arcsStore.fetchArcs(true)
  // If the countdown was started when user left for arc-detail, show now that they're back
  if (coachShouldRun() && countdownRunning.value) showCoachNow()

  onAction('navigate_next', moveNext)
  onAction('navigate_prev', movePrev)
  onAction('open_thread', openFocused)
  onAction('archive', archiveFocused)
  onAction('select_toggle', selectFocused)
})

onUnmounted(() => {
  // User leaving inbox (most likely to view an arc) — start the 20s countdown
  if (coachShouldRun()) startArcViewCountdown()

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

function handleBulkArchive() {
  void arcsStore.bulkArchive()
}

function handleBulkLabel(label: string) {
  void arcsStore.bulkLabel(label)
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
  <div>
    <header class="border-b border-ctp-surface0 bg-ctp-mantle px-4 py-3">
      <h1 class="text-lg font-semibold">Inbox</h1>
    </header>

    <main class="mx-auto max-w-4xl px-4 py-4">
      <InboxError v-if="arcsStore.error" :message="arcsStore.error" />

      <StatusTabs :active-tab="arcsStore.activeTab" @change="handleTabChange" />

      <BulkActionBar
        v-if="arcsStore.selectedIds.size > 0"
        :count="arcsStore.selectedIds.size"
        :pending="arcsStore.bulkActionPending"
        @archive="handleBulkArchive"
        @label="handleBulkLabel"
        @clear="arcsStore.clearSelection()"
      />

      <div
        v-if="arcsStore.loading"
        role="status"
        aria-label="Loading inbox…"
        class="animate-pulse divide-y divide-ctp-surface0"
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
        v-else-if="!arcsStore.loading && arcsStore.sortedItems.length === 0"
        :tab="arcsStore.activeTab"
      />

      <ArcList
        v-else
        :arcs="arcsStore.sortedItems"
        :selected-ids="arcsStore.selectedIds"
        :all-selected="arcsStore.allSelected"
        :focused-arc-id="focusedArcId"
        @toggle-select="arcsStore.toggleSelect"
        @select-all="arcsStore.selectAll()"
        @clear-selection="arcsStore.clearSelection()"
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

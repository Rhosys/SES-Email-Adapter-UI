<script setup lang="ts">
import { onMounted } from 'vue'
import { useAccountStore } from '@/stores/account'
import { useArcsStore } from '@/stores/arcs'
import { useRelativeTime } from '@/composables/useRelativeTime'
import StatusTabs from '@/components/StatusTabs.vue'
import BulkActionBar from '@/components/BulkActionBar.vue'
import ArcList from '@/components/ArcList.vue'
import InboxError from '@/components/InboxError.vue'
import InboxEmpty from '@/components/InboxEmpty.vue'

const accountStore = useAccountStore()
const arcsStore = useArcsStore()

useRelativeTime()

onMounted(async () => {
  await accountStore.fetchAccount()
  if (accountStore.accountId) {
    await arcsStore.fetchArcs(accountStore.accountId, true)
  }
})

function handleTabChange(tab: 'active' | 'archived' | 'all') {
  if (accountStore.accountId) arcsStore.setTab(tab, accountStore.accountId)
}

function handleLoadMore() {
  if (accountStore.accountId) void arcsStore.fetchMoreArcs(accountStore.accountId)
}

function handleBulkArchive() {
  if (accountStore.accountId) void arcsStore.bulkArchive(accountStore.accountId)
}

function handleBulkLabel(label: string) {
  if (accountStore.accountId) void arcsStore.bulkLabel(accountStore.accountId, label)
}
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

      <div v-if="arcsStore.loading" class="py-16 text-center text-ctp-subtext0">Loading…</div>

      <InboxEmpty
        v-else-if="!arcsStore.loading && arcsStore.sortedItems.length === 0"
        :tab="arcsStore.activeTab"
      />

      <ArcList
        v-else
        :arcs="arcsStore.sortedItems"
        :selected-ids="arcsStore.selectedIds"
        :all-selected="arcsStore.allSelected"
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
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useDraftsStore } from '@/stores/drafts'
import { useRelativeTime } from '@/composables/useRelativeTime'
import DraftRow from '@/components/DraftRow.vue'

const store = useDraftsStore()
useRelativeTime()

const isEmpty = computed(() => !store.loading && store.drafts.length === 0)

onMounted(async () => {
  await store.refreshTopArcs()
})
</script>

<template>
  <div>
    <header class="border-b border-ctp-surface0 bg-ctp-mantle px-4 py-3">
      <h1 class="text-lg font-semibold">Drafts</h1>
    </header>
    <main class="mx-auto max-w-3xl">
      <!-- Loading -->
      <div
        v-if="store.loading"
        role="status"
        aria-label="Loading drafts…"
        class="animate-pulse divide-y divide-ctp-surface0 border-b border-ctp-surface0"
      >
        <div v-for="i in 3" :key="i" class="flex items-center gap-3 px-4 py-3">
          <div class="flex-1 space-y-1.5">
            <div class="h-4 rounded bg-ctp-surface1" :style="{ width: `${50 + (i * 13) % 35}%` }" />
            <div class="h-3 w-32 rounded bg-ctp-surface1" />
          </div>
        </div>
      </div>

      <!-- Empty -->
      <div v-else-if="isEmpty" class="px-4 py-20 text-center">
        <p class="text-base font-medium text-ctp-text">No drafts</p>
        <p class="mx-auto mt-2 max-w-sm text-sm text-ctp-subtext0">
          When you start composing a reply but don't send it, it'll appear here.
        </p>
      </div>

      <div v-else role="list" aria-label="Drafts">
        <DraftRow
          v-for="signal in store.drafts"
          :key="signal.signalId"
          :signal="signal"
          :pending="false"
        />
      </div>
    </main>
  </div>
</template>

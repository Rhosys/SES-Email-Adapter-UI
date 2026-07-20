<script setup lang="ts">
import { ref } from 'vue'
import { formatBadgeCount } from '@/lib/badge'

type TabKey = 'active' | 'archived' | 'all'

defineProps<{
  activeTab: TabKey
  // Active-thread count for the Inbox tab badge (mobile bar only). Passed in from
  // InboxView so this component stays store-free and unit-testable in isolation.
  activeCount?: number
  activeCountHasMore?: boolean
}>()
const emit = defineEmits<{ (e: 'change', tab: TabKey): void }>()

// viewBox 0 0 24 24 stroke icons, matching SettingsTabBar.
const tabs: { key: TabKey; label: string; description: string; icon: string }[] = [
  {
    key: 'active',
    label: 'Inbox',
    description: 'Active email threads waiting for processing or reply',
    icon: '<path d="M4 4h16a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z"/><path d="M3 13h5l2 3h4l2-3h5"/>',
  },
  {
    key: 'archived',
    label: 'Archived',
    description: 'Threads that have been completed or manually archived',
    icon: '<rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8"/><path d="M9.5 12h5"/>',
  },
  {
    key: 'all',
    label: 'All',
    description: 'Every thread regardless of status',
    icon: '<path d="M12 3l9 5-9 5-9-5 9-5Z"/><path d="M3 12l9 5 9-5"/><path d="M3 16l9 5 9-5"/>',
  },
]

const tabRefs = ref<HTMLButtonElement[]>([])

// Arrow-key roving focus on the desktop strip (mobile is touch-only).
function onKeydown(e: KeyboardEvent, index: number) {
  if (e.key === 'ArrowRight') {
    const next = (index + 1) % tabs.length
    tabRefs.value[next]?.focus()
    emit('change', tabs[next].key)
  } else if (e.key === 'ArrowLeft') {
    const prev = (index - 1 + tabs.length) % tabs.length
    tabRefs.value[prev]?.focus()
    emit('change', tabs[prev].key)
  }
}
</script>

<template>
  <!-- Desktop (≥ sm): top tab strip -->
  <div class="mb-2 hidden border-b border-ctp-surface0 sm:flex" role="tablist">
    <button
      v-for="(tab, i) in tabs"
      :key="tab.key"
      :ref="(el) => { if (el) tabRefs[i] = el as HTMLButtonElement }"
      role="tab"
      :aria-selected="activeTab === tab.key"
      :aria-label="tab.description"
      :title="tab.description"
      :tabindex="activeTab === tab.key ? 0 : -1"
      class="px-4 py-2.5 text-sm transition-colors"
      :class="
        activeTab === tab.key
          ? 'border-b-2 border-ctp-blue font-medium text-ctp-text'
          : 'text-ctp-subtext0 hover:text-ctp-text'
      "
      @click="emit('change', tab.key)"
      @keydown="onKeydown($event, i)"
    >
      {{ tab.label }}
    </button>
  </div>

  <!-- Mobile (< sm): fixed bottom icon bar. z-20 keeps it below the mobile
       sidebar (z-40) and its backdrop (z-30) when the nav is open. -->
  <nav
    class="fixed inset-x-0 bottom-0 z-20 flex items-stretch border-t border-ctp-surface0 bg-ctp-mantle pb-[env(safe-area-inset-bottom)] sm:hidden"
    role="tablist"
    aria-label="Thread status"
  >
    <button
      v-for="tab in tabs"
      :key="`m-${tab.key}`"
      type="button"
      role="tab"
      :aria-selected="activeTab === tab.key"
      :aria-label="tab.description"
      class="flex min-w-0 flex-1 flex-col items-center gap-0.5 px-1 py-2 transition-colors"
      :class="activeTab === tab.key ? 'text-ctp-mauve' : 'text-ctp-subtext0 hover:text-ctp-text'"
      @click="emit('change', tab.key)"
    >
      <span class="relative">
        <!-- eslint-disable vue/no-v-html -- static, trusted icon markup (no user input) -->
        <svg
          class="h-5 w-5 shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
          v-html="tab.icon"
        />
        <!-- eslint-enable vue/no-v-html -->
        <span
          v-if="tab.key === 'active' && (activeCount ?? 0) > 0"
          class="absolute -right-2.5 -top-1.5 rounded-full bg-ctp-green px-1 py-0.5 text-[9px] font-semibold leading-none text-ctp-base"
        >
          {{ formatBadgeCount(activeCount ?? 0, activeCountHasMore ?? false) }}
        </span>
      </span>
      <span class="text-[10px] leading-tight">{{ tab.label }}</span>
    </button>
  </nav>
</template>

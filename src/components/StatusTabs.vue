<script setup lang="ts">
type TabKey = 'active' | 'archived' | 'all'

defineProps<{ activeTab: TabKey; total: number }>()
const emit = defineEmits<{ (e: 'change', tab: TabKey): void }>()

const tabs: { key: TabKey; label: string }[] = [
  { key: 'active', label: 'Inbox' },
  { key: 'archived', label: 'Archived' },
  { key: 'all', label: 'All' },
]
</script>

<template>
  <div class="mb-2 flex border-b border-ctp-surface0" role="tablist">
    <button
      v-for="tab in tabs"
      :key="tab.key"
      role="tab"
      :aria-selected="activeTab === tab.key"
      class="px-4 py-2 text-sm transition-colors"
      :class="
        activeTab === tab.key
          ? 'border-b-2 border-ctp-blue font-medium text-ctp-text'
          : 'text-ctp-subtext0 hover:text-ctp-text'
      "
      @click="emit('change', tab.key)"
    >
      {{ tab.label }}
      <span
        v-if="tab.key === activeTab && total > 0"
        class="ml-1.5 rounded-full bg-ctp-surface1 px-1.5 py-0.5 text-xs text-ctp-subtext0"
        >{{ total }}</span
      >
    </button>
  </div>
</template>

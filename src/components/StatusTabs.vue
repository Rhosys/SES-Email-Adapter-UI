<script setup lang="ts">
type TabKey = 'active' | 'archived' | 'all'

defineProps<{ activeTab: TabKey }>()
const emit = defineEmits<{ (e: 'change', tab: TabKey): void }>()

const tabs: { key: TabKey; label: string; title: string }[] = [
  { key: 'active', label: 'Inbox', title: 'Active email threads waiting for processing or reply' },
  { key: 'archived', label: 'Archived', title: 'Threads that have been completed or manually archived' },
  { key: 'all', label: 'All', title: 'Every thread regardless of status' },
]
</script>

<template>
  <div class="mb-2 flex border-b border-ctp-surface0" role="tablist">
    <button
      v-for="tab in tabs"
      :key="tab.key"
      role="tab"
      :aria-selected="activeTab === tab.key"
      :title="tab.title"
      class="px-4 py-2.5 text-sm transition-colors"
      :class="
        activeTab === tab.key
          ? 'border-b-2 border-ctp-blue font-medium text-ctp-text'
          : 'text-ctp-subtext0 hover:text-ctp-text'
      "
      @click="emit('change', tab.key)"
    >
      {{ tab.label }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

type TabKey = 'active' | 'archived' | 'all'

defineProps<{ activeTab: TabKey }>()
const emit = defineEmits<{ (e: 'change', tab: TabKey): void }>()

const tabs: { key: TabKey; label: string; description: string }[] = [
  { key: 'active', label: 'Inbox', description: 'Active email threads waiting for processing or reply' },
  { key: 'archived', label: 'Archived', description: 'Threads that have been completed or manually archived' },
  { key: 'all', label: 'All', description: 'Every thread regardless of status' },
]

const tabRefs = ref<HTMLButtonElement[]>([])

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
  <div class="mb-2 flex border-b border-ctp-surface0" role="tablist">
    <button
      v-for="(tab, i) in tabs"
      :key="tab.key"
      :ref="(el) => { if (el) tabRefs[i] = el as HTMLButtonElement }"
      role="tab"
      :aria-selected="activeTab === tab.key"
      :aria-label="tab.description"
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
</template>

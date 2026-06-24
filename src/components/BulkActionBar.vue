<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { RouterLink } from 'vue-router'
import { useLabelsStore } from '@/stores/labels'
import AsyncButton from '@/components/ui/AsyncButton.vue'

const props = defineProps<{
  count: number
  pending: boolean
  allSelected: boolean
  tab: 'active' | 'archived' | 'all'
  archiveAction?: () => Promise<unknown>
  moveToInboxAction?: () => Promise<unknown>
  labelAction: (label: string) => Promise<unknown>
}>()

const emit = defineEmits<{
  (e: 'select-all'): void
  (e: 'clear-selection'): void
  (e: 'clear'): void
}>()

const labelsStore = useLabelsStore()

const isEmpty = computed(() => props.count === 0)

const labelInput = ref('')
const dropdownOpen = ref(false)
const dropdownRef = ref<HTMLElement | null>(null)

const filteredLabels = computed(() => {
  const q = labelInput.value.trim().toLowerCase()
  if (!q) return labelsStore.items
  return labelsStore.items.filter((l) => l.name.toLowerCase().includes(q))
})

function handleSelectAll(event: Event) {
  const checkbox = event.target as HTMLInputElement
  if (checkbox.checked) {
    emit('select-all')
  } else {
    emit('clear-selection')
  }
}

function openDropdown() {
  dropdownOpen.value = true
}

function closeDropdown() {
  dropdownOpen.value = false
}

function selectLabel(name: string) {
  labelInput.value = name
  closeDropdown()
  void labelActionWrapper(props.labelAction)()
}

function handleClickOutside(e: MouseEvent) {
  if (dropdownRef.value && !dropdownRef.value.contains(e.target as Node)) {
    closeDropdown()
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})

function labelActionWrapper(action: (label: string) => Promise<unknown>) {
  return async () => {
    const val = labelInput.value.trim()
    if (!val) return
    await action(val)
    labelInput.value = ''
    closeDropdown()
  }
}
</script>

<template>
  <div
    class="mb-2 flex flex-wrap items-center gap-3 rounded border border-ctp-surface1 bg-ctp-mantle px-3 py-2 text-sm"
  >
    <!-- Select-all checkbox -->
    <input
      type="checkbox"
      :checked="allSelected"
      class="h-4 w-4 rounded border-ctp-overlay0 bg-ctp-surface1 accent-ctp-blue"
      aria-label="Select all threads"
      @change="handleSelectAll"
    />

    <span class="text-ctp-subtext1">{{ count || 0 }} selected</span>

    <div
      class="flex flex-wrap items-center gap-3 transition-opacity"
      :class="{ 'pointer-events-none opacity-50': isEmpty }"
    >
      <!-- Archive (active + all tabs) -->
      <AsyncButton
        v-if="tab === 'active' || tab === 'all'"
        :action="archiveAction!"
        :disabled="pending"
        variant="ghost"
        class="flex items-center gap-1.5 rounded bg-ctp-surface0 px-3 py-1.5 text-ctp-text hover:bg-ctp-surface1"
      >
        <svg class="h-4 w-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M1.5 2h13l-1 2H2.5L1.5 2zm.5 3h12v9a1 1 0 01-1 1H3a1 1 0 01-1-1V5zm4 2v5h5V7H6z"/>
        </svg>
        Archive
      </AsyncButton>

      <!-- Move to Inbox (archived + all tabs) -->
      <AsyncButton
        v-if="tab === 'archived' || tab === 'all'"
        :action="moveToInboxAction!"
        :disabled="pending"
        variant="ghost"
        class="flex items-center gap-1.5 rounded bg-ctp-surface0 px-3 py-1.5 text-ctp-text hover:bg-ctp-surface1"
      >
        <svg class="h-4 w-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M8 1a1 1 0 011 1v5.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 011.414-1.414L7 7.586V2a1 1 0 011-1zM2 10a1 1 0 011 1v2h10v-2a1 1 0 112 0v3a1 1 0 01-1 1H2a1 1 0 01-1-1v-3a1 1 0 011-1z"/>
        </svg>
        Inbox
      </AsyncButton>

      <!-- Add label (all tabs) -->
      <form ref="dropdownRef" class="relative flex flex-wrap items-center gap-1" @submit.prevent="labelActionWrapper(labelAction)()">
        <div class="flex items-center gap-1.5">
          <svg class="h-4 w-4 text-ctp-subtext0" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M2 3a1 1 0 011-1h4.586a1 1 0 01.707.293l5.414 5.414a1 1 0 010 1.414l-4.586 4.586a1 1 0 01-1.414 0L2.293 8.293A1 1 0 012 7.586V3zm2 1a1 1 0 100 2 1 1 0 000-2z"/>
          </svg>
          <input
            v-model="labelInput"
            type="text"
            aria-label="Label name"
            placeholder="Add label…"
            autocomplete="off"
            class="w-full rounded border border-ctp-surface1 bg-ctp-surface0 px-2 py-1.5 text-sm text-ctp-text placeholder-ctp-overlay0 focus:outline-none focus:ring-1 focus:ring-ctp-blue sm:w-auto"
            @focus="openDropdown"
            @input="openDropdown"
          />
        </div>
        <AsyncButton
          :action="labelActionWrapper(labelAction)"
          :disabled="pending || !labelInput.trim()"
          type="submit"
          variant="ghost"
          class="rounded bg-ctp-surface0 px-2 py-1.5 text-ctp-subtext0 hover:bg-ctp-surface1"
        >
          Add
        </AsyncButton>

        <!-- Autocomplete dropdown -->
        <div
          v-if="dropdownOpen && (filteredLabels.length > 0 || labelInput.trim())"
          class="absolute left-0 top-full z-50 mt-1 max-h-48 w-56 overflow-y-auto rounded border border-ctp-surface1 bg-ctp-mantle shadow-lg"
        >
          <button
            v-for="label in filteredLabels"
            :key="label.label"
            type="button"
            class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-ctp-subtext1 hover:bg-ctp-surface0 hover:text-ctp-text"
            @click="selectLabel(label.name)"
          >
            <span class="h-2 w-2 shrink-0 rounded-full" :style="{ backgroundColor: label.color ?? '#cba6f7' }" />
            <span class="truncate">{{ label.name }}</span>
          </button>
          <RouterLink
            to="/labels"
            class="flex w-full items-center gap-2 border-t border-ctp-surface1 px-3 py-1.5 text-left text-sm text-ctp-mauve hover:bg-ctp-surface0"
            @click="closeDropdown"
          >
            ＋ New Label
          </RouterLink>
        </div>
      </form>

      <button class="ml-auto text-ctp-subtext0 hover:text-ctp-text" @click="emit('clear')">
        Clear
      </button>
    </div>
  </div>
</template>

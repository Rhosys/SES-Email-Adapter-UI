<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { RouterLink } from 'vue-router'
import { useLabelsStore } from '@/stores/labels'
import AsyncButton from '@/components/ui/AsyncButton.vue'

const props = defineProps<{ count: number; pending: boolean; archiveAction: () => Promise<unknown>; labelAction: (label: string) => Promise<unknown> }>()
const emit = defineEmits<{
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
    class="mb-2 flex flex-wrap items-center gap-3 rounded border border-ctp-surface1 bg-ctp-mantle px-3 py-2 text-sm transition-opacity"
    :class="{ 'pointer-events-none opacity-50': isEmpty }"
  >
    <span class="text-ctp-subtext1">{{ count || 0 }} selected</span>

    <AsyncButton
      :action="archiveAction"
      :disabled="pending"
      variant="ghost"
      class="rounded bg-ctp-surface0 px-3 py-1.5 text-ctp-text hover:bg-ctp-surface1"
    >
      Archive
    </AsyncButton>

    <form ref="dropdownRef" class="relative flex flex-wrap items-center gap-1" @submit.prevent="labelActionWrapper(labelAction)()">
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
</template>

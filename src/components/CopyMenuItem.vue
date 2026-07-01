<script setup lang="ts">
import { useToast } from '@/composables/useToast'

const props = defineProps<{ value: string; label: string }>()
const emit = defineEmits<{ click: [] }>()

const { notify } = useToast()

async function copy() {
  emit('click')
  try {
    await navigator.clipboard.writeText(props.value)
    notify(`${props.label} copied`)
  } catch {
    // Silent failure — clipboard access may be denied
  }
}
</script>

<template>
  <button
    type="button"
    role="menuitem"
    class="flex w-full items-center gap-2 py-2 text-left text-sm text-ctp-subtext1 hover:bg-ctp-surface0 hover:text-ctp-text sm:hidden"
    @click="copy"
  >
    <svg class="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
    Copy {{ label }}
  </button>
</template>

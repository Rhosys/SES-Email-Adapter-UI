<script setup lang="ts">
import { watch, ref, computed, nextTick, onBeforeUnmount } from 'vue'

const props = withDefaults(
  defineProps<{
    open: boolean
    title: string
    message: string
    confirmLabel?: string
    confirmVariant?: 'danger' | 'primary'
    requireInput?: string
    requireInputLabel?: string
  }>(),
  {
    confirmLabel: 'Confirm',
    confirmVariant: 'danger',
    requireInput: undefined,
    requireInputLabel: undefined,
  },
)

const emit = defineEmits<{
  confirm: []
  cancel: []
}>()

const dialogRef = ref<HTMLDivElement | null>(null)
const inputValue = ref('')

const confirmEnabled = computed(() => {
  if (!props.requireInput) return true
  return inputValue.value === props.requireInput
})

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault()
    emit('cancel')
  }
  if (e.key === 'Tab' && dialogRef.value) {
    const focusable = dialogRef.value.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    )
    if (focusable.length === 0) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }
}

watch(
  () => props.open,
  async (isOpen) => {
    if (isOpen) {
      inputValue.value = ''
      await nextTick()
      const input = dialogRef.value?.querySelector<HTMLElement>('input')
      if (input) {
        input.focus()
      } else {
        dialogRef.value?.querySelector<HTMLElement>('button')?.focus()
      }
      document.addEventListener('keydown', onKeydown)
    } else {
      document.removeEventListener('keydown', onKeydown)
    }
  },
)

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <Transition name="confirm-fade">
    <div
      v-if="open"
      class="fixed inset-0 z-[200] flex items-center justify-center bg-ctp-base/80"
      aria-hidden="true"
      @click.self="emit('cancel')"
    >
      <div
        ref="dialogRef"
        role="alertdialog"
        aria-modal="true"
        :aria-labelledby="'confirm-title'"
        class="mx-4 w-full max-w-sm rounded-xl border border-ctp-surface1 bg-ctp-mantle p-6 shadow-2xl"
      >
        <h2 id="confirm-title" class="text-base font-semibold text-ctp-text">{{ title }}</h2>
        <p class="mt-2 text-sm text-ctp-subtext0">{{ message }}</p>
        <div v-if="requireInput" class="mt-4">
          <label for="confirm-require-input" class="block text-xs text-ctp-subtext0">
            {{ requireInputLabel ?? `Type "${requireInput}" to confirm` }}
          </label>
          <input
            id="confirm-require-input"
            v-model="inputValue"
            type="text"
            class="mt-1 w-full rounded-lg border border-ctp-surface1 bg-ctp-base px-3 py-1.5 text-sm text-ctp-text placeholder:text-ctp-surface2 focus:border-ctp-mauve focus:outline-none"
            :placeholder="requireInput"
            autocomplete="off"
            spellcheck="false"
          />
        </div>
        <div class="mt-5 flex justify-end gap-3">
          <button
            class="px-3 py-1.5 text-sm text-ctp-subtext1 hover:text-ctp-text"
            @click="emit('cancel')"
          >
            Cancel
          </button>
          <button
            class="rounded-lg px-4 py-1.5 text-sm font-medium text-ctp-base hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            :class="confirmVariant === 'danger' ? 'bg-ctp-red' : 'bg-ctp-mauve'"
            :disabled="!confirmEnabled"
            @click="emit('confirm')"
          >
            {{ confirmLabel }}
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.confirm-fade-enter-active,
.confirm-fade-leave-active {
  transition: opacity 0.15s ease;
}
.confirm-fade-enter-from,
.confirm-fade-leave-to {
  opacity: 0;
}
</style>

<script setup lang="ts">
import { watch, ref, nextTick, onBeforeUnmount } from 'vue'
import type { UnknownSenderPolicy } from '@/types/server'

const props = defineProps<{
  open: boolean
  address: string
  currentMode: UnknownSenderPolicy
  modes: { value: UnknownSenderPolicy; label: string; description: string }[]
}>()

const emit = defineEmits<{
  select: [mode: UnknownSenderPolicy]
  close: []
}>()

const dialogRef = ref<HTMLDivElement | null>(null)

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault()
    emit('close')
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
      await nextTick()
      dialogRef.value?.querySelector<HTMLElement>('button')?.focus()
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
  <Transition name="filter-modal-fade">
    <div
      v-if="open"
      class="fixed inset-0 z-[200] flex items-center justify-center bg-ctp-base/80"
      aria-hidden="true"
      @click.self="emit('close')"
    >
      <div
        ref="dialogRef"
        role="dialog"
        aria-modal="true"
        aria-labelledby="filter-modal-title"
        class="mx-4 w-full max-w-md rounded-xl border border-ctp-surface1 bg-ctp-mantle p-6 shadow-2xl"
      >
        <h2 id="filter-modal-title" class="text-base font-semibold text-ctp-text">
          Filter mode for {{ address }}
        </h2>
        <p class="mt-2 text-sm text-ctp-subtext0">
          Choose how emails from unknown senders are handled for this address.
        </p>

        <div class="mt-4 space-y-2">
          <button
            v-for="mode in modes"
            :key="mode.value"
            type="button"
            class="flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors"
            :class="
              currentMode === mode.value
                ? 'border-ctp-mauve bg-ctp-mauve/10'
                : 'border-ctp-surface1 hover:border-ctp-surface2'
            "
            @click="emit('select', mode.value)"
          >
            <span
              class="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2"
              :class="
                currentMode === mode.value
                  ? 'border-ctp-mauve'
                  : 'border-ctp-surface2'
              "
            >
              <span
                v-if="currentMode === mode.value"
                class="h-2 w-2 rounded-full bg-ctp-mauve"
              />
            </span>
            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium text-ctp-text">{{ mode.label }}</p>
              <p class="text-xs text-ctp-subtext0">{{ mode.description }}</p>
            </div>
          </button>
        </div>

        <div class="mt-5 flex justify-end">
          <button
            class="rounded-lg bg-ctp-mauve px-4 py-1.5 text-sm font-medium text-ctp-base hover:opacity-90"
            @click="emit('close')"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.filter-modal-fade-enter-active,
.filter-modal-fade-leave-active {
  transition: opacity 0.15s ease;
}
.filter-modal-fade-enter-from,
.filter-modal-fade-leave-to {
  opacity: 0;
}
</style>

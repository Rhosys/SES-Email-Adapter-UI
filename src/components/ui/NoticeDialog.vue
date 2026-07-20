<script setup lang="ts">
import { watch, ref, nextTick, onBeforeUnmount } from 'vue'

// A single-button informational popup — for surfacing an explanation the user
// just needs to acknowledge (e.g. an action the server can't perform yet).
// Distinct from ConfirmDialog, which asks a yes/no question.
const props = withDefaults(
  defineProps<{
    open: boolean
    title: string
    message: string
    dismissLabel?: string
    tone?: 'info' | 'warning'
  }>(),
  {
    dismissLabel: 'Got it',
    tone: 'info',
  },
)

const emit = defineEmits<{ close: [] }>()

const dialogRef = ref<HTMLDivElement | null>(null)

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault()
    emit('close')
  }
}

// Focus the dismiss button and listen for Escape while open.
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
  <Transition name="notice-fade">
    <!-- No aria-hidden here — it would hide the nested role="alertdialog" from
         the accessibility tree entirely (aria-hidden on an ancestor hides the
         whole subtree), breaking screen readers' and getByRole('alertdialog')
         queries alike even though the dialog is visibly on screen. -->
    <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions,vuejs-accessibility/click-events-have-key-events -- click-outside-to-close is a mouse enhancement; Escape (handled in script) is the keyboard equivalent -->
    <div
      v-if="open"
      class="fixed inset-0 z-[200] flex items-center justify-center bg-ctp-base/80"
      @click.self="emit('close')"
    >
      <div
        ref="dialogRef"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="notice-title"
        aria-describedby="notice-message"
        class="mx-4 w-full max-w-md rounded-xl border border-ctp-surface1 bg-ctp-mantle p-6 shadow-2xl"
      >
        <div class="flex items-start gap-3">
          <span
            class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
            :class="tone === 'warning' ? 'bg-ctp-peach/15 text-ctp-peach' : 'bg-ctp-sapphire/15 text-ctp-sapphire'"
            aria-hidden="true"
          >
            <svg class="h-4 w-4" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 0a8 8 0 100 16A8 8 0 008 0zM7 4a1 1 0 112 0 1 1 0 01-2 0zm.25 3a.75.75 0 011.5 0v4.5a.75.75 0 01-1.5 0V7z" />
            </svg>
          </span>
          <div class="min-w-0 flex-1">
            <h2 id="notice-title" class="text-base font-semibold text-ctp-text">{{ title }}</h2>
            <p id="notice-message" class="mt-2 whitespace-pre-line text-sm text-ctp-subtext0">{{ message }}</p>
          </div>
        </div>
        <div class="mt-5 flex justify-end">
          <button
            class="rounded-lg bg-ctp-mauve px-4 py-1.5 text-sm font-medium text-ctp-base hover:opacity-90"
            @click="emit('close')"
          >
            {{ dismissLabel }}
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.notice-fade-enter-active,
.notice-fade-leave-active {
  transition: opacity 0.15s ease;
}
.notice-fade-enter-from,
.notice-fade-leave-to {
  opacity: 0;
}
</style>

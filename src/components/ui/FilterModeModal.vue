<script setup lang="ts">
import { watch, ref, nextTick, onBeforeUnmount } from 'vue'

const props = defineProps<{
  open: boolean
  title: string
  subtitle?: string
  currentMode: string
  modes: { value: string; label: string; description: string }[]
}>()

const emit = defineEmits<{
  select: [mode: string]
  close: []
}>()

const dialogRef = ref<HTMLDivElement | null>(null)
const selectedMode = ref(props.currentMode)

function save() {
  if (selectedMode.value !== props.currentMode) {
    emit('select', selectedMode.value)
  }
  emit('close')
}

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
      selectedMode.value = props.currentMode
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
    <!-- No aria-hidden here — it would hide the nested role="dialog" from the
         accessibility tree entirely (aria-hidden on an ancestor hides the
         whole subtree), breaking screen readers' and getByRole('dialog')
         queries alike even though the dialog is visibly on screen. -->
    <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions,vuejs-accessibility/click-events-have-key-events -- click-outside-to-close is a mouse enhancement; Escape (handled in script) is the keyboard equivalent -->
    <div
      v-if="open"
      class="fixed inset-0 z-[200] flex items-center justify-center bg-ctp-base/80"
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
          {{ title }}
        </h2>
        <p class="mt-2 text-sm text-ctp-subtext0">
          {{ subtitle ?? 'Choose how emails from unknown senders are handled for this address.' }}
        </p>

        <div class="mt-4 space-y-2">
          <button
            v-for="mode in modes"
            :key="mode.value"
            type="button"
            class="flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors"
            :class="
              selectedMode === mode.value
                ? 'border-ctp-mauve bg-ctp-mauve/10'
                : 'border-ctp-surface1 hover:border-ctp-surface2'
            "
            @click="selectedMode = mode.value"
          >
            <span
              class="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2"
              :class="
                selectedMode === mode.value
                  ? 'border-ctp-mauve'
                  : 'border-ctp-surface2'
              "
            >
              <span
                v-if="selectedMode === mode.value"
                class="h-2 w-2 rounded-full bg-ctp-mauve"
              />
            </span>
            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium text-ctp-text">{{ mode.label }}</p>
              <p class="text-xs text-ctp-subtext0">{{ mode.description }}</p>
            </div>
          </button>
        </div>

        <div class="mt-5 flex justify-between">
          <button
            class="rounded-lg border border-ctp-surface1 px-4 py-1.5 text-sm font-medium text-ctp-subtext0 hover:border-ctp-surface2 hover:text-ctp-text"
            @click="emit('close')"
          >
            Cancel
          </button>
          <button
            class="rounded-lg bg-ctp-mauve px-4 py-1.5 text-sm font-medium text-ctp-base hover:opacity-90 disabled:opacity-50"
            :disabled="selectedMode === currentMode"
            @click="save"
          >
            Save
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

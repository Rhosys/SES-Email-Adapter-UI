<script setup lang="ts">
/**
 * Modal for adding a forwarding target (email or webhook). Single-panel design:
 * type selector (radio-style) always visible at top, input below changes based
 * on selection. [Cancel] [Add] buttons at bottom.
 */
import { ref, watch, nextTick, onBeforeUnmount } from 'vue'
import AsyncButton from '@/components/ui/AsyncButton.vue'

const props = defineProps<{
  open: boolean
  submit: (payload: { type: 'email' | 'webhook'; target: string }) => Promise<unknown>
}>()

const emit = defineEmits<{ 'update:open': [value: boolean] }>()

const selectedType = ref<'email' | 'webhook' | null>(null)
const target = ref('')
const dialogRef = ref<HTMLDivElement | null>(null)

function reset() {
  selectedType.value = null
  target.value = ''
}

function close() {
  reset()
  emit('update:open', false)
}

async function submitForm() {
  if (!selectedType.value || !target.value.trim()) return
  await props.submit({ type: selectedType.value, target: target.value.trim() })
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault()
    close()
  }
  if (e.key === 'Tab' && dialogRef.value) {
    const focusable = dialogRef.value.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    )
    if (focusable.length === 0) return
    const first = focusable[0]!
    const last = focusable[focusable.length - 1]!
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
      reset()
      await nextTick()
      dialogRef.value?.querySelector<HTMLElement>('button')?.focus()
      document.addEventListener('keydown', onKeydown)
    } else {
      document.removeEventListener('keydown', onKeydown)
    }
  },
)

watch(selectedType, () => {
  target.value = ''
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <Transition name="add-target-modal-fade">
    <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions,vuejs-accessibility/click-events-have-key-events -->
    <div
      v-if="open"
      class="fixed inset-0 z-[200] flex items-center justify-center bg-ctp-base/80 p-4"
      @click.self="close"
    >
      <div
        ref="dialogRef"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-target-modal-title"
        class="w-full max-w-md rounded-xl border border-ctp-surface1 bg-ctp-mantle p-5 shadow-2xl"
      >
        <h2 id="add-target-modal-title" class="mb-4 text-base font-medium text-ctp-text">New forwarding target</h2>

        <!-- Type selector (radio-style) -->
        <div class="mb-4 flex gap-2">
          <button
            type="button"
            class="flex flex-1 items-center gap-2 rounded-lg border px-4 py-3 text-sm transition-colors"
            :class="selectedType === 'email'
              ? 'border-ctp-mauve bg-ctp-mauve/10 text-ctp-mauve'
              : 'border-ctp-surface1 text-ctp-subtext1 hover:border-ctp-mauve/50 hover:text-ctp-text'"
            @click="selectedType = 'email'"
          >
            <svg class="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
              <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z"/>
              <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z"/>
            </svg>
            Email
          </button>
          <button
            type="button"
            class="flex flex-1 items-center gap-2 rounded-lg border px-4 py-3 text-sm transition-colors"
            :class="selectedType === 'webhook'
              ? 'border-ctp-mauve bg-ctp-mauve/10 text-ctp-mauve'
              : 'border-ctp-surface1 text-ctp-subtext1 hover:border-ctp-mauve/50 hover:text-ctp-text'"
            @click="selectedType = 'webhook'"
          >
            <svg class="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M12.586 4.586a2 2 0 112.828 2.828l-3 3a2 2 0 01-2.828 0 1 1 0 00-1.414 1.414 4 4 0 005.656 0l3-3a4 4 0 00-5.656-5.656l-1.5 1.5a1 1 0 101.414 1.414l1.5-1.5zm-5 5a2 2 0 012.828 0 1 1 0 101.414-1.414 4 4 0 00-5.656 0l-3 3a4 4 0 105.656 5.656l1.5-1.5a1 1 0 10-1.414-1.414l-1.5 1.5a2 2 0 11-2.828-2.828l3-3z" clip-rule="evenodd"/>
            </svg>
            Webhook
          </button>
        </div>

        <!-- Input (only visible when a type is selected) -->
        <form v-if="selectedType" @submit.prevent="submitForm">
          <input
            v-model="target"
            :type="selectedType === 'email' ? 'email' : 'url'"
            :aria-label="selectedType === 'email' ? 'Email address' : 'Webhook URL'"
            :placeholder="selectedType === 'email' ? 'forward@example.com' : 'https://hooks.example.com/...'"
            class="mb-4 w-full rounded-lg border border-ctp-surface1 bg-ctp-base px-3 py-2.5 text-sm text-ctp-text placeholder:text-ctp-overlay0 focus:border-ctp-mauve focus:outline-none"
            autofocus
          />

          <!-- Actions -->
          <div class="flex justify-end gap-2">
            <button
              type="button"
              class="rounded-lg border border-ctp-surface1 px-4 py-2 text-sm text-ctp-subtext1 transition-colors hover:border-ctp-text hover:text-ctp-text"
              @click="close"
            >
              Cancel
            </button>
            <AsyncButton
              type="submit"
              :action="submitForm"
              :disabled="!target.trim()"
              class="rounded-lg bg-ctp-mauve px-4 py-2 text-sm font-medium text-ctp-base hover:opacity-90 disabled:opacity-50"
            >
              Add
            </AsyncButton>
          </div>
        </form>

        <!-- Actions (when no type selected yet) -->
        <div v-else class="flex justify-end">
          <button
            type="button"
            class="rounded-lg border border-ctp-surface1 px-4 py-2 text-sm text-ctp-subtext1 transition-colors hover:border-ctp-text hover:text-ctp-text"
            @click="close"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.add-target-modal-fade-enter-active,
.add-target-modal-fade-leave-active {
  transition: opacity 0.15s ease;
}
.add-target-modal-fade-enter-from,
.add-target-modal-fade-leave-to {
  opacity: 0;
}
</style>

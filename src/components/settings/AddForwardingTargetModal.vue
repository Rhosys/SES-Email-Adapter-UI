<script setup lang="ts">
/**
 * Popup for adding a forwarding target (email or webhook). Reused from the
 * Email & Forwarding tab's own "Add Forwarding Target" button and from the
 * "＋ Add new…" option in the calendar/digest target selects — one flow
 * everywhere rather than a separate inline form per call site.
 *
 * The actual API call stays with the caller (`submit`, matching this
 * codebase's AsyncButton convention of passing an action function rather
 * than emitting and separately tracking a pending prop) so this component
 * doesn't need to know about accounts/stores at all.
 */
import { ref, watch, nextTick, onBeforeUnmount } from 'vue'
import AsyncButton from '@/components/ui/AsyncButton.vue'

const props = defineProps<{
  open: boolean
  submit: (payload: { type: 'email' | 'webhook'; target: string }) => Promise<unknown>
}>()

const emit = defineEmits<{ 'update:open': [value: boolean] }>()

const addTargetType = ref<'email' | 'webhook' | null>(null)
const newForwardTarget = ref('')
const dialogRef = ref<HTMLDivElement | null>(null)

function reset() {
  addTargetType.value = null
  newForwardTarget.value = ''
}

function close() {
  reset()
  emit('update:open', false)
}

async function submitForm() {
  if (!addTargetType.value || !newForwardTarget.value.trim()) return
  await props.submit({ type: addTargetType.value, target: newForwardTarget.value.trim() })
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
      reset()
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
  <Transition name="add-target-modal-fade">
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
        class="w-full max-w-sm rounded-xl border border-ctp-surface1 bg-ctp-mantle p-4 shadow-2xl"
      >
        <div class="mb-3 flex items-center justify-between">
          <span id="add-target-modal-title" class="text-sm font-medium text-ctp-text">New forwarding target</span>
          <button type="button" class="text-xs text-ctp-subtext0 hover:text-ctp-text" @click="close">
            Cancel
          </button>
        </div>

        <!-- Type selection -->
        <div v-if="!addTargetType" class="flex gap-2">
          <button
            type="button"
            class="flex-1 rounded-lg border border-ctp-surface1 px-4 py-3 text-sm text-ctp-text transition-colors hover:border-ctp-mauve hover:text-ctp-mauve"
            @click="addTargetType = 'email'"
          >
            <svg class="mx-auto mb-1 h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z"/><path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z"/></svg>
            Email
          </button>
          <button
            type="button"
            class="flex-1 rounded-lg border border-ctp-surface1 px-4 py-3 text-sm text-ctp-text transition-colors hover:border-ctp-mauve hover:text-ctp-mauve"
            @click="addTargetType = 'webhook'"
          >
            <svg class="mx-auto mb-1 h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M12.586 4.586a2 2 0 112.828 2.828l-3 3a2 2 0 01-2.828 0 1 1 0 00-1.414 1.414 4 4 0 005.656 0l3-3a4 4 0 00-5.656-5.656l-1.5 1.5a1 1 0 101.414 1.414l1.5-1.5zm-5 5a2 2 0 012.828 0 1 1 0 101.414-1.414 4 4 0 00-5.656 0l-3 3a4 4 0 105.656 5.656l1.5-1.5a1 1 0 10-1.414-1.414l-1.5 1.5a2 2 0 11-2.828-2.828l3-3z" clip-rule="evenodd"/></svg>
            Webhook
          </button>
        </div>

        <!-- Input form -->
        <form v-else class="flex gap-2" @submit.prevent="submitForm">
          <input
            v-model="newForwardTarget"
            :type="addTargetType === 'email' ? 'email' : 'url'"
            :aria-label="addTargetType === 'email' ? 'Email address' : 'Webhook URL'"
            :placeholder="addTargetType === 'email' ? 'forward@example.com' : 'https://hooks.example.com/...'"
            class="flex-1 rounded-lg border border-ctp-surface1 bg-ctp-base px-3 py-2 text-sm text-ctp-text placeholder:text-ctp-overlay0 focus:border-ctp-mauve focus:outline-none"
            autofocus
          />
          <AsyncButton
            type="submit"
            :action="submitForm"
            :disabled="!newForwardTarget.trim()"
            class="rounded-lg bg-ctp-mauve px-4 py-2 text-sm font-medium text-ctp-base hover:opacity-90"
          >
            Add
          </AsyncButton>
          <button
            type="button"
            class="rounded-lg border border-ctp-surface1 px-3 py-2 text-xs text-ctp-subtext0 hover:text-ctp-text"
            @click="addTargetType = null; newForwardTarget = ''"
          >
            Back
          </button>
        </form>
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

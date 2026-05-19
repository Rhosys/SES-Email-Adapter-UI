<script setup lang="ts">
import { ref, watch, nextTick, onMounted, onUnmounted } from 'vue'
import {
  useShortcutsStore,
  PRESET_LABELS,
  ACTION_LABELS,
} from '@/stores/shortcuts'
import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts'
import type { ShortcutAction, KeyBinding, PresetId } from '@/stores/shortcuts'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ 'update:open': [value: boolean] }>()

const shortcutsStore = useShortcutsStore()
const { setCapturing } = useKeyboardShortcuts()

const editingAction = ref<ShortcutAction | null>(null)
const captureRef = ref<HTMLButtonElement | null>(null)
const pendingBinding = ref<KeyBinding | null>(null)
const captureError = ref<string | null>(null)
const conflictActions = ref<ShortcutAction[]>([])

const GROUPS: { label: string; actions: ShortcutAction[] }[] = [
  {
    label: 'Navigation',
    actions: ['navigate_next', 'navigate_prev', 'open_thread', 'select_toggle'],
  },
  {
    label: 'Thread actions',
    actions: [
      'archive',
      'delete',
      'reply',
      'reply_all',
      'forward',
      'mute',
      'star',
      'mark_read',
      'mark_unread',
    ],
  },
  { label: 'Compose', actions: ['compose'] },
  { label: 'Global', actions: ['search', 'shortcut_help'] },
  {
    label: 'Go to',
    actions: [
      'go_inbox',
      'go_quarantine',
      'go_labels',
      'go_rules',
      'go_settings',
      'go_profile',
    ],
  },
]

const SHIFTED_SYMBOLS = new Set([
  '!', '@', '#', '$', '%', '^', '&', '*', '(', ')', '_', '+',
  '{', '}', '|', ':', '"', '<', '>', '?', '~',
])

const MODIFIER_KEYS = new Set([
  'Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'NumLock', 'ScrollLock',
  'Hyper', 'Super', 'Fn', 'FnLock',
])

function displayKey(b: KeyBinding | undefined): string {
  if (!b) return '—'
  if (b.prefix) {
    return `${b.prefix.toUpperCase()} → ${b.key.toUpperCase()}`
  }
  const parts: string[] = []
  if (b.ctrl) parts.push('Ctrl')
  if (b.alt) parts.push('Alt')
  if (b.shift && !SHIFTED_SYMBOLS.has(b.key)) parts.push('⇧')
  parts.push(b.key === ' ' ? 'Space' : b.key)
  return parts.join('+')
}

function close() {
  cancelEdit()
  emit('update:open', false)
}

function cancelEdit() {
  editingAction.value = null
  pendingBinding.value = null
  captureError.value = null
  conflictActions.value = []
  setCapturing(false)
}

function startEdit(action: ShortcutAction) {
  editingAction.value = action
  pendingBinding.value = null
  captureError.value = null
  conflictActions.value = []
  setCapturing(true)
  void nextTick(() => captureRef.value?.focus())
}

function onCaptureKey(e: KeyboardEvent) {
  e.stopPropagation()
  e.preventDefault()

  if (e.key === 'Escape' || e.key === 'Tab') {
    cancelEdit()
    return
  }

  if (MODIFIER_KEYS.has(e.key)) return

  if (/^F\d+$/.test(e.key)) {
    captureError.value = 'Function keys cannot be used'
    return
  }

  if (e.ctrlKey || e.metaKey) {
    captureError.value = 'Ctrl / ⌘ shortcuts are reserved by the browser'
    return
  }

  const isGoTo = editingAction.value?.startsWith('go_')
  const binding: KeyBinding = {
    key: e.key,
    ...(e.shiftKey ? { shift: true } : {}),
    ...(e.altKey ? { alt: true } : {}),
    ...(isGoTo ? { prefix: 'g' } : {}),
  }

  const conflicts = shortcutsStore.findConflicts(binding, editingAction.value ?? undefined)
  if (conflicts.length === 0) {
    shortcutsStore.setBinding(editingAction.value!, binding)
    cancelEdit()
  } else {
    pendingBinding.value = binding
    conflictActions.value = conflicts
    captureError.value = null
  }
}

function commitCapture() {
  if (!pendingBinding.value || !editingAction.value) return
  for (const action of conflictActions.value) {
    shortcutsStore.setBinding(action, null)
  }
  shortcutsStore.setBinding(editingAction.value, pendingBinding.value)
  cancelEdit()
}

function clearBinding(action: ShortcutAction) {
  shortcutsStore.setBinding(action, null)
  cancelEdit()
}

// Close on Escape when not in capture mode
function onDocKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.open && !editingAction.value) close()
}

onMounted(() => document.addEventListener('keydown', onDocKeydown, { capture: true }))
onUnmounted(() => document.removeEventListener('keydown', onDocKeydown, { capture: true }))

watch(
  () => props.open,
  (v) => {
    if (!v) cancelEdit()
  },
)
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="open"
        class="fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        <!-- Backdrop -->
        <div
          role="presentation"
          class="absolute inset-0 bg-black/60 backdrop-blur-sm"
          @click="close"
        />

        <!-- Modal -->
        <div
          class="relative z-10 flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-ctp-surface1 bg-ctp-mantle shadow-2xl"
          role="dialog"
          aria-modal="true"
          aria-label="Keyboard shortcuts"
        >
          <!-- Header -->
          <div class="flex items-center justify-between border-b border-ctp-surface0 px-5 py-4">
            <div>
              <h2 class="text-sm font-semibold text-ctp-text">Keyboard shortcuts</h2>
              <p class="mt-0.5 text-xs text-ctp-subtext0">Press <kbd class="rounded bg-ctp-surface1 px-1 py-0.5 font-mono text-xs">?</kbd> anywhere to toggle</p>
            </div>
            <button
              class="flex h-7 w-7 items-center justify-center rounded text-ctp-subtext0 hover:bg-ctp-surface1 hover:text-ctp-text"
              aria-label="Close shortcuts"
              @click="close"
            >
              <svg class="h-3.5 w-3.5" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true">
                <path d="M1 1l10 10M11 1L1 11"/>
              </svg>
            </button>
          </div>

          <!-- Preset chips -->
          <div class="flex flex-wrap items-center gap-1.5 border-b border-ctp-surface0 px-5 py-3">
            <span class="text-xs text-ctp-subtext0">Load preset:</span>
            <button
              v-for="(label, preset) in PRESET_LABELS"
              :key="preset"
              class="rounded border px-2.5 py-1 text-xs transition-colors"
              :class="'border-ctp-surface1 text-ctp-subtext1 hover:border-ctp-mauve hover:text-ctp-mauve'"
              @click="shortcutsStore.loadPreset(preset as PresetId)"
            >
              {{ label }}
            </button>
          </div>

          <!-- Shortcut table -->
          <div class="flex-1 overflow-y-auto px-5 py-3">
            <div
              v-for="group in GROUPS"
              :key="group.label"
              class="mb-5 last:mb-0"
            >
              <p class="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-ctp-subtext0">
                {{ group.label }}
              </p>
              <div class="divide-y divide-ctp-surface0 rounded-lg border border-ctp-surface1">
                <div
                  v-for="action in group.actions"
                  :key="action"
                  class="flex min-h-[2.5rem] items-center gap-3 px-3"
                >
                  <span class="min-w-0 flex-1 truncate text-sm text-ctp-text">
                    {{ ACTION_LABELS[action] }}
                  </span>

                  <!-- Capture mode for this row -->
                  <template v-if="editingAction === action">
                    <div class="flex flex-1 flex-col gap-1">
                      <!-- Conflict warning -->
                      <div v-if="conflictActions.length > 0" class="text-xs text-ctp-peach">
                        Conflicts with: {{ conflictActions.map(a => ACTION_LABELS[a]).join(', ') }}
                      </div>
                      <div class="flex items-center gap-1.5">
                        <button
                          ref="captureRef"
                          class="flex-1 rounded border border-dashed border-ctp-mauve bg-ctp-mauve/10 px-2 py-1 text-center text-xs text-ctp-mauve focus:outline-none focus:ring-1 focus:ring-ctp-mauve"
                          :aria-label="`Capturing key for ${ACTION_LABELS[action]}`"
                          @keydown="onCaptureKey"
                        >
                          {{ pendingBinding ? displayKey(pendingBinding) : 'Press a key…' }}
                        </button>
                        <button
                          v-if="conflictActions.length > 0"
                          class="shrink-0 rounded border border-ctp-peach px-2 py-1 text-xs text-ctp-peach hover:bg-ctp-peach/10"
                          @click="commitCapture"
                        >
                          Save anyway
                        </button>
                        <button
                          class="shrink-0 rounded border border-ctp-surface1 px-2 py-1 text-xs text-ctp-subtext1 hover:text-ctp-text"
                          @click="cancelEdit"
                        >
                          Cancel
                        </button>
                      </div>
                      <p v-if="captureError" class="text-xs text-ctp-red">{{ captureError }}</p>
                      <p v-if="action.startsWith('go_')" class="text-xs text-ctp-subtext0">
                        g → [key you press]
                      </p>
                    </div>
                  </template>

                  <!-- Normal display -->
                  <template v-else>
                    <kbd
                      class="shrink-0 rounded bg-ctp-surface1 px-1.5 py-0.5 font-mono text-xs text-ctp-subtext0"
                    >
                      {{ displayKey(shortcutsStore.effectiveShortcuts[action]) }}
                    </kbd>
                    <div class="flex shrink-0 items-center gap-1">
                      <button
                        class="rounded px-2 py-0.5 text-xs text-ctp-subtext0 hover:bg-ctp-surface1 hover:text-ctp-text"
                        @click="startEdit(action)"
                      >
                        Edit
                      </button>
                      <button
                        v-if="shortcutsStore.effectiveShortcuts[action]"
                        class="rounded px-1 py-0.5 text-xs text-ctp-subtext0 hover:bg-ctp-surface1 hover:text-ctp-red"
                        :title="`Remove shortcut for ${ACTION_LABELS[action]}`"
                        @click="clearBinding(action)"
                      >
                        ×
                      </button>
                    </div>
                  </template>
                </div>
              </div>
            </div>
          </div>

          <!-- Footer -->
          <div class="flex items-center justify-between border-t border-ctp-surface0 px-5 py-3">
            <button
              class="text-xs text-ctp-subtext0 hover:text-ctp-red"
              @click="shortcutsStore.resetAll()"
            >
              Reset all to defaults
            </button>
            <button
              class="rounded-lg border border-ctp-surface1 px-3 py-1.5 text-xs text-ctp-subtext1 hover:border-ctp-mauve hover:text-ctp-mauve"
              @click="close"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

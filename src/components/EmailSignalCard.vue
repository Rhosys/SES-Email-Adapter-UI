<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import type { Signal } from '@/types/server'
import { isEmailSignal, isInboundEmailSignal } from '@/lib/signal-guards'
import { useAccountStore } from '@/stores/account'
import { api } from '@/lib/api'
import { useGestureHandler } from '@/composables/useGestureHandler'

const props = defineProps<{ signal: Signal; duplicates?: Signal[] }>()
const emit = defineEmits<{ undo: [] }>()

const router = useRouter()
const accountStore = useAccountStore()
const expanded = ref(true)
const menuOpen = ref(false)
const undoPending = ref(false)
const undoError = ref<string | null>(null)
const showDuplicates = ref(false)

const receivedCount = computed(() => (props.duplicates?.length ?? 0) + 1)

const isUserSent = computed(() => props.signal.source === 'user')

const fromLabel = computed(() => {
  if (!isEmailSignal(props.signal)) return ''
  const { name, address } = props.signal.data.from
  return name ? `${name} <${address}>` : address
})

const hasSpamWarning = computed(() => {
  if (!isInboundEmailSignal(props.signal)) return false
  return (props.signal.data.spamScore ?? 0) > 0.3
})

const sentAt = computed(() => {
  if (!isInboundEmailSignal(props.signal)) return ''
  return new Date(props.signal.data.receivedAt).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
})

function viewOriginal() {
  menuOpen.value = false
  void router.push({ name: 'arc-detail', params: { id: props.signal.arcId } })
}

async function undoSend() {
  menuOpen.value = false
  if (!accountStore.accountId || undoPending.value) return
  undoPending.value = true
  undoError.value = null
  const result = await api.patchSignal(accountStore.accountId, props.signal.signalId, { status: 'draft' })
  undoPending.value = false
  if (result.isOk()) {
    emit('undo')
  } else {
    undoError.value = 'Email already delivered — cannot undo'
  }
}

// Best-effort auto-height: works if the browser grants parent access to the
// srcdoc iframe's contentDocument (behaviour varies; fails silently if not).
// The sandbox intentionally omits allow-scripts and allow-same-origin, so this
// may always fall through to the CSS min-height — that is the safe fallback.
function fitHeight(e: Event) {
  const iframe = e.target as HTMLIFrameElement
  try {
    const h = iframe.contentDocument?.documentElement.scrollHeight
    if (h) iframe.style.height = `${h}px`
  } catch {
    // Cross-origin sandbox blocked contentDocument access — keep CSS min-height
  }
}

// --- Gesture / zoom for the email body iframe ---
//
// Touch events that start inside the iframe don't bubble to the parent document,
// so a transparent overlay div captures all gestures. Single taps temporarily
// become pointer-events:none so the browser's synthetic click reaches the iframe
// (enabling link clicks), and is restored ~600 ms later.
//
// Supported gestures:
//   • Pinch open/close  — zoom email content (1× – 4×)
//   • Double-tap        — zoom to 2.5× centred on tap, or reset to 1×
//   • Single-finger pan — pan while zoomed (page scroll when at 1×)
//   • Swipe down        — collapse the email card (unzoomed only)

const gestureOverlayRef = ref<HTMLElement | null>(null)

const {
  scale: emailScale,
  translateX: emailTx,
  translateY: emailTy,
  isGesturing: emailIsGesturing,
  reset: resetEmailZoom,
} = useGestureHandler(gestureOverlayRef, {
  onSingleTap: () => {
    const overlay = gestureOverlayRef.value
    // When at natural scale, let the browser's synthetic click reach the iframe
    if (!overlay || emailScale.value > 1) return
    overlay.style.pointerEvents = 'none'
    setTimeout(() => {
      if (gestureOverlayRef.value) gestureOverlayRef.value.style.pointerEvents = ''
    }, 600)
  },

  onDoubleTap: (cx, cy) => {
    if (emailScale.value > 1) {
      resetEmailZoom()
      return
    }
    const el = gestureOverlayRef.value
    if (!el) return
    const newScale = 2.5
    const w = el.offsetWidth
    const h = el.offsetHeight
    // Keep the tapped point fixed: translate so cx stays at cx after scaling
    emailTx.value = Math.max(w * (1 - newScale), Math.min(0, cx - cx * newScale))
    emailTy.value = Math.max(h * (1 - newScale), Math.min(0, cy - cy * newScale))
    emailScale.value = newScale
  },

  onSwipe: (dir) => {
    if (dir === 'down') expanded.value = false
  },
})

// Reset zoom whenever the card is collapsed
watch(expanded, (v) => { if (!v) resetEmailZoom() })

const iframeStyle = computed(() => ({
  minHeight: '200px',
  border: 'none',
  display: 'block',
  transformOrigin: '0 0',
  transform: `translate(${emailTx.value}px, ${emailTy.value}px) scale(${emailScale.value})`,
  // Suppress transition during active gestures to avoid input lag
  transition: emailIsGesturing.value ? 'none' : 'transform 0.25s ease-out',
  willChange: 'transform',
}))

// pan-y: let the page scroll normally when at natural scale;
// none: we own all touch handling when zoomed in
const overlayTouchAction = computed(() => (emailScale.value > 1 ? 'none' : 'pan-y'))

const zoomLabel = computed(() => `${(Math.round(emailScale.value * 10) / 10).toFixed(1)}×`)
</script>

<template>
  <div class="rounded-lg border border-ctp-surface1 bg-ctp-mantle">
    <!-- Card header -->
    <div class="flex items-center px-4 py-3">
      <button
        class="min-w-0 flex-1 text-left"
        :aria-expanded="expanded"
        @click="expanded = !expanded"
      >
        <div class="flex items-center gap-2">
          <span class="text-sm font-medium text-ctp-text">{{ fromLabel }}</span>
          <span
            v-if="hasSpamWarning"
            class="text-xs text-ctp-peach"
            title="Higher-than-normal spam score"
            >⚠ Possible spam</span
          >
        </div>
        <span class="text-xs text-ctp-subtext0">{{ sentAt }}</span>
      </button>

      <!-- Duplicate count badge -->
      <button
        v-if="duplicates && duplicates.length > 0"
        class="mr-2 shrink-0 rounded-full bg-ctp-surface1 px-2 py-0.5 text-xs text-ctp-subtext1 hover:bg-ctp-surface2"
        :aria-expanded="showDuplicates"
        @click.stop="showDuplicates = !showDuplicates"
      >
        × {{ receivedCount }}
      </button>

      <!-- Undo error inline -->
      <span v-if="undoError" class="mr-2 shrink-0 text-xs text-ctp-red">{{ undoError }}</span>

      <!-- Collapse toggle -->
      <span class="mr-2 shrink-0 text-xs text-ctp-subtext0" aria-hidden="true">{{ expanded ? '▲' : '▼' }}</span>

      <!-- Overflow menu -->
      <div class="relative shrink-0">
        <button
          class="flex h-6 w-6 items-center justify-center rounded text-ctp-subtext0 hover:bg-ctp-surface1 hover:text-ctp-text"
          aria-label="Signal actions"
          aria-haspopup="true"
          :aria-expanded="menuOpen"
          @click.stop="menuOpen = !menuOpen"
        >
          <svg class="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <circle cx="8" cy="2.5" r="1.5" /><circle cx="8" cy="8" r="1.5" /><circle cx="8" cy="13.5" r="1.5" />
          </svg>
        </button>

        <div
          v-if="menuOpen"
          class="absolute right-0 top-full z-20 min-w-44 rounded-lg border border-ctp-surface1 bg-ctp-mantle py-1 shadow-lg"
          role="menu"
        >
          <button
            class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-ctp-subtext1 hover:bg-ctp-surface0 hover:text-ctp-text"
            role="menuitem"
            @click="viewOriginal"
          >
            View original email
          </button>
          <button
            v-if="isUserSent"
            :disabled="undoPending"
            class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-ctp-red hover:bg-ctp-surface0 disabled:opacity-50"
            role="menuitem"
            @click="undoSend"
          >
            {{ undoPending ? 'Undoing…' : 'Undo send' }}
          </button>
        </div>

        <!-- Click-outside backdrop -->
        <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions,vuejs-accessibility/click-events-have-key-events -->
        <div v-if="menuOpen" class="fixed inset-0 z-10" @click="menuOpen = false" />
      </div>
    </div>

    <!-- Email body -->
    <template v-if="expanded && signal.type === 'email'">
      <div class="border-t border-ctp-surface1">
        <div v-if="signal.data.body" class="relative overflow-hidden">
          <iframe
            :srcdoc="signal.data.body"
            sandbox="allow-popups allow-popups-to-escape-sandbox"
            referrerpolicy="no-referrer"
            class="w-full"
            :style="iframeStyle"
            title="Email content"
            @load="fitHeight"
          />

          <!-- Transparent gesture capture overlay.
               Always covers the iframe because touch events that start inside
               an iframe don't bubble to the parent document.
               Single taps are handled by temporarily setting pointer-events:none
               so the browser's delayed synthetic click reaches the iframe. -->
          <div
            ref="gestureOverlayRef"
            class="absolute inset-0"
            :style="{ touchAction: overlayTouchAction }"
            aria-hidden="true"
          />

          <!-- Zoom controls — z-index above overlay so they receive clicks directly -->
          <div
            v-if="emailScale > 1"
            class="absolute right-2 top-2 z-20 flex items-center gap-1.5"
          >
            <span
              class="rounded-full bg-ctp-surface0/80 px-2 py-0.5 text-xs text-ctp-subtext1 backdrop-blur-sm"
              aria-live="polite"
              aria-label="Current zoom level"
            >{{ zoomLabel }}</span>
            <button
              class="rounded-full bg-ctp-surface0/80 px-2 py-0.5 text-xs text-ctp-text backdrop-blur-sm hover:bg-ctp-surface1/90 active:bg-ctp-surface2"
              aria-label="Reset zoom to 100%"
              @click="resetEmailZoom"
            >
              Reset
            </button>
          </div>
        </div>
        <p v-else class="px-4 py-3 text-sm text-ctp-subtext0">(No content)</p>
      </div>
    </template>

    <!-- Earlier copies -->
    <template v-if="showDuplicates && duplicates && duplicates.length > 0">
      <div class="border-t border-ctp-surface1 px-4 py-2">
        <p class="mb-1 text-xs font-medium text-ctp-subtext0">Earlier copies</p>
        <ul class="space-y-0.5">
          <li
            v-for="dup in duplicates"
            :key="dup.signalId"
            class="text-xs text-ctp-subtext0"
          >
            {{ isInboundEmailSignal(dup) ? new Date(dup.data.receivedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '' }}
          </li>
        </ul>
      </div>
    </template>
  </div>
</template>

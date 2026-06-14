<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { Signal } from '@/types/server'
import { isEmailSignal, isInboundEmailSignal } from '@/lib/signal-guards'
import { useAccountStore } from '@/stores/account'
import { api } from '@/lib/api'
import { useGestureHandler } from '@/composables/useGestureHandler'

const props = defineProps<{ signal: Signal; duplicates?: Signal[] }>()
const emit = defineEmits<{ undo: [] }>()

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

const isBcc = computed(() => {
  if (!isInboundEmailSignal(props.signal)) return false
  const alias = props.signal.data.recipientAddress?.toLowerCase()
  if (!alias) return false
  const inTo = props.signal.data.to.some((a) => a.address.toLowerCase() === alias)
  const inCc = props.signal.data.cc.some((a) => a.address.toLowerCase() === alias)
  return !inTo && !inCc
})

const envelopeSender = computed(() => {
  if (!isInboundEmailSignal(props.signal)) return null
  const returnPath = props.signal.data.headers['Return-Path'] ?? props.signal.data.headers['return-path']
  if (!returnPath) return null
  const cleaned = returnPath.replace(/[<>]/g, '').trim()
  if (!isEmailSignal(props.signal)) return cleaned
  // Only show if different from the From address
  if (cleaned.toLowerCase() === props.signal.data.from.address.toLowerCase()) return null
  return cleaned
})

const replyToLabel = computed(() => {
  if (!isEmailSignal(props.signal)) return null
  const rt = props.signal.data.replyTo
  if (!rt) return null
  // Only show if different from from address
  if (rt.address.toLowerCase() === props.signal.data.from.address.toLowerCase()) return null
  return rt.name ? `${rt.name} <${rt.address}>` : rt.address
})

const attachmentCount = computed(() => {
  if (!isEmailSignal(props.signal)) return 0
  return props.signal.data.attachments.length
})

const rawSignalJson = ref('')
const showRawModal = ref(false)
const showOriginalModal = ref(false)
const rawCopied = ref(false)
const originalCopied = ref(false)

function viewRawSignal() {
  menuOpen.value = false
  rawSignalJson.value = JSON.stringify(props.signal, null, 2)
  showRawModal.value = true
}

function viewOriginalEmail() {
  menuOpen.value = false
  showOriginalModal.value = true
}

function copyRawJson() {
  void navigator.clipboard.writeText(rawSignalJson.value).then(() => {
    rawCopied.value = true
    setTimeout(() => { rawCopied.value = false }, 1500)
  })
}

function copyOriginalHtml() {
  if (!isEmailSignal(props.signal) || !props.signal.data.body) return
  void navigator.clipboard.writeText(props.signal.data.body).then(() => {
    originalCopied.value = true
    setTimeout(() => { originalCopied.value = false }, 1500)
  })
}

const sentAt = computed(() => {
  if (!isInboundEmailSignal(props.signal)) return ''
  return new Date(props.signal.data.receivedAt).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
})

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
// so a transparent overlay div captures all gestures.
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
  // onSingleTap intentionally omitted: forwarding clicks to a sandboxed iframe via
  // pointer-events:none is unreliable on modern browsers because the synthetic click
  // fires in < 50 ms (before the style change lands). Links inside the email body
  // work normally with a mouse on desktop; touch link clicks are a known limitation
  // of the overlay-over-iframe approach.

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
    <div class="flex items-start gap-3 px-4 py-3">
      <button
        class="min-w-0 flex-1 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-ctp-surface0/70"
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
        <div v-if="isEmailSignal(signal) && signal.data.to.length > 0" class="text-xs text-ctp-subtext0">
          To: {{ signal.data.to.map((a) => a.name ?? a.address).join(', ') }}
        </div>
        <div v-if="isEmailSignal(signal) && signal.data.cc.length > 0" class="text-xs text-ctp-subtext0">
          CC: {{ signal.data.cc.map((a) => a.name ?? a.address).join(', ') }}
        </div>
        <div v-if="isBcc" class="text-xs font-medium text-ctp-red">
          ⚠ BCC — alias not in To or CC
        </div>
        <span class="text-xs text-ctp-subtext0">{{ sentAt }}</span>
        <span v-if="replyToLabel" class="text-xs text-ctp-peach" title="Reply-To differs from sender">↩ {{ replyToLabel }}</span>
        <span v-if="envelopeSender" class="text-xs text-ctp-subtext0" :title="`Envelope: ${envelopeSender}`">✉ {{ envelopeSender }}</span>
        <span v-if="attachmentCount > 0" class="text-xs text-ctp-subtext0" :title="`${attachmentCount} attachment${attachmentCount > 1 ? 's' : ''}`">📎 {{ attachmentCount }}</span>
      </button>

      <!-- Duplicate count badge -->
      <button
        v-if="duplicates && duplicates.length > 0"
        class="mt-1 shrink-0 rounded-full bg-ctp-surface1 px-2 py-0.5 text-xs text-ctp-subtext1 hover:bg-ctp-surface2"
        :aria-expanded="showDuplicates"
        @click.stop="showDuplicates = !showDuplicates"
      >
        × {{ receivedCount }}
      </button>

      <!-- Undo error inline -->
      <span v-if="undoError" class="mt-1 shrink-0 text-xs text-ctp-red">{{ undoError }}</span>

      <!-- Overflow menu -->
      <div class="relative shrink-0">
        <button
          class="flex h-9 w-9 items-center justify-center rounded-lg text-ctp-subtext0 transition-colors hover:bg-ctp-surface1 hover:text-ctp-text"
          aria-label="Signal actions"
          aria-haspopup="true"
          :aria-expanded="menuOpen"
          @click.stop="menuOpen = !menuOpen"
        >
          <svg class="h-4 w-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <circle cx="8" cy="2.5" r="1.5" /><circle cx="8" cy="8" r="1.5" /><circle cx="8" cy="13.5" r="1.5" />
          </svg>
        </button>

        <div
          v-if="menuOpen"
          class="absolute right-0 top-full z-20 min-w-48 rounded-lg border border-ctp-surface1 bg-ctp-mantle py-1.5 shadow-lg"
          role="menu"
        >
          <button
            class="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-ctp-subtext1 hover:bg-ctp-surface0 hover:text-ctp-text"
            role="menuitem"
            @click="viewRawSignal"
          >
            Show headers
          </button>
          <button
            v-if="isEmailSignal(signal) && signal.data.body"
            class="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-ctp-subtext1 hover:bg-ctp-surface0 hover:text-ctp-text"
            role="menuitem"
            @click="viewOriginalEmail"
          >
            View original email
          </button>
          <button
            v-if="isUserSent"
            :disabled="undoPending"
            class="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-ctp-red hover:bg-ctp-surface0 disabled:opacity-50"
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
        <div v-if="signal.data.body" class="relative overflow-hidden bg-white" data-testid="email-body-container">
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
               a sandboxed iframe don't bubble to the parent document. -->
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

  <!-- Raw signal data modal -->
  <Teleport to="body">
    <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions,vuejs-accessibility/click-events-have-key-events -->
    <div v-if="showRawModal" class="fixed inset-0 z-[200] flex items-center justify-center bg-ctp-base/80" @click.self="showRawModal = false">
      <div class="relative max-h-[80vh] w-full max-w-2xl overflow-auto rounded-xl border border-ctp-surface1 bg-ctp-mantle p-4 shadow-2xl">
        <div class="mb-3 flex items-center justify-between">
          <h3 class="text-sm font-semibold text-ctp-text">Signal data</h3>
          <div class="flex items-center gap-3">
            <button class="text-xs text-ctp-subtext0 hover:text-ctp-mauve" @click="copyRawJson">{{ rawCopied ? '✓ Copied' : 'Copy' }}</button>
            <button class="text-xs text-ctp-subtext0 hover:text-ctp-text" @click="showRawModal = false">Close</button>
          </div>
        </div>
        <pre class="overflow-auto rounded-lg bg-ctp-base p-3 font-mono text-xs text-ctp-text">{{ rawSignalJson }}</pre>
      </div>
    </div>
  </Teleport>

  <!-- Original email modal -->
  <Teleport to="body">
    <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions,vuejs-accessibility/click-events-have-key-events -->
    <div v-if="showOriginalModal && isEmailSignal(signal) && signal.data.body" class="fixed inset-0 z-[200] flex items-center justify-center bg-ctp-base/80" @click.self="showOriginalModal = false">
      <div class="relative max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-xl border border-ctp-surface1 bg-white shadow-2xl">
        <div class="flex items-center justify-between border-b border-ctp-surface0 bg-ctp-mantle px-4 py-3">
          <h3 class="text-sm font-semibold text-ctp-text">Original email</h3>
          <div class="flex items-center gap-3">
            <button class="text-xs text-ctp-subtext0 hover:text-ctp-mauve" @click="copyOriginalHtml">{{ originalCopied ? '✓ Copied' : 'Copy HTML' }}</button>
            <button class="text-xs text-ctp-subtext0 hover:text-ctp-text" @click="showOriginalModal = false">Close</button>
          </div>
        </div>
        <iframe
          :srcdoc="signal.data.body"
          sandbox="allow-popups allow-popups-to-escape-sandbox"
          referrerpolicy="no-referrer"
          class="h-[80vh] w-full border-none"
          title="Original email content"
        />
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import type { Signal } from '@/types/server'
import { isEmailSignal, isInboundEmailSignal } from '@/lib/signal-guards'
import { useAccountStore } from '@/stores/account'
import { isAdminUser } from '@/stores/admin'
import { useRulesStore } from '@/stores/rules'
import { api } from '@/lib/api'
import { useGestureHandler } from '@/composables/useGestureHandler'
import ActionBadge from '@/components/ActionBadge.vue'
import CopyMenuItem from '@/components/CopyMenuItem.vue'

const props = withDefaults(defineProps<{ signal: Signal; defaultExpanded?: boolean }>(), { defaultExpanded: true })
const emit = defineEmits<{ undo: []; reply: []; reprocessed: [] }>()

const router = useRouter()
const route = useRoute()
const accountStore = useAccountStore()
const rulesStore = useRulesStore()
const expanded = ref(props.defaultExpanded)
const menuOpen = ref(false)
const reprocessing = ref(false)
const reprocessError = ref<string | null>(null)
const undoPending = ref(false)
const undoError = ref<string | null>(null)
const isUserSent = computed(() => props.signal.source === 'user')
const threadId = computed(() => props.signal.arcId)

const signalMatchedRules = computed(() => {
  if (!isInboundEmailSignal(props.signal)) return []
  return props.signal.data.matchedRules ?? []
})

function ruleFor(ruleId: string) {
  return rulesStore.items.find((r) => r.ruleId === ruleId)
}

function showMatchedRules() {
  menuOpen.value = false
  showMatchedRulesModal.value = true
}

const fromName = computed(() => {
  if (!isEmailSignal(props.signal)) return ''
  return props.signal.data.from.name ?? props.signal.data.from.address
})

const fromAddress = computed(() => {
  if (!isEmailSignal(props.signal)) return ''
  // Only show address separately when there's also a display name
  if (!props.signal.data.from.name) return ''
  return props.signal.data.from.address
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

const subjectLine = computed(() => {
  if (!isEmailSignal(props.signal)) return ''
  return props.signal.data.subject
})

const rawSignalJson = ref('')
const showRawModal = ref(false)
const showOriginalModal = ref(false)
const showMatchedRulesModal = ref(false)
const rawCopied = ref(false)
const originalCopied = ref(false)
const originalEmailSource = ref('')
const originalLoading = ref(false)
const originalError = ref<string | null>(null)

function viewRawSignal() {
  menuOpen.value = false
  if (!isEmailSignal(props.signal)) return
  const d = props.signal.data
  const lines: string[] = []
  if (d.from) lines.push(`From: ${d.from.name ? `${d.from.name} <${d.from.address}>` : d.from.address}`)
  if ('to' in d && d.to.length > 0) lines.push(`To: ${d.to.map((a) => a.name ? `${a.name} <${a.address}>` : a.address).join(', ')}`)
  if ('cc' in d && d.cc.length > 0) lines.push(`CC: ${d.cc.map((a) => a.name ? `${a.name} <${a.address}>` : a.address).join(', ')}`)
  if (d.subject) lines.push(`Subject: ${d.subject}`)
  if ('receivedAt' in d) lines.push(`Date: ${d.receivedAt}`)
  if ('headers' in d && d.headers) {
    for (const [key, value] of Object.entries(d.headers)) {
      lines.push(`${key}: ${value}`)
    }
  }
  rawSignalJson.value = lines.join('\n')
  showRawModal.value = true
}

function viewOriginalEmail() {
  menuOpen.value = false
  showOriginalModal.value = true
  originalError.value = null

  if (originalEmailSource.value) return

  if (!accountStore.accountId) return
  originalLoading.value = true
  void api.getRawEmail(accountStore.accountId, props.signal.signalId).then((result) => {
    originalLoading.value = false
    if (result.isOk()) {
      originalEmailSource.value = result.value
    } else {
      originalError.value = result.error.message
    }
  })
}

function copyRawJson() {
  void navigator.clipboard.writeText(rawSignalJson.value).then(() => {
    rawCopied.value = true
    setTimeout(() => { rawCopied.value = false }, 1500)
  })
}

function copyOriginalHtml() {
  if (!originalEmailSource.value) return
  void navigator.clipboard.writeText(originalEmailSource.value).then(() => {
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

async function reprocessSignal() {
  menuOpen.value = false
  if (!accountStore.accountId || reprocessing.value) return
  reprocessing.value = true
  reprocessError.value = null

  const result = await api.reprocessSignal(accountStore.accountId, props.signal.signalId)

  if (result.isErr()) {
    reprocessing.value = false
    reprocessError.value = result.error.message
    return
  }

  const newSignal = result.value

  // Blocked / reported signals don't belong to any arc or quarantine screen the
  // admin can view — send them back to the inbox.
  if (newSignal.status === 'block_hidden' || newSignal.status === 'block_reject' || newSignal.status === 'report_violation') {
    void router.push('/')
    return
  }

  // No arc means the signal landed in quarantine.
  if (!newSignal.arcId) {
    void router.push(`/quarantine/${newSignal.signalId}`)
    return
  }

  const currentArcId = route.params.id as string
  if (newSignal.arcId !== currentArcId) {
    void router.replace(`/arcs/${newSignal.arcId}`)
    return
  }

  reprocessing.value = false
  emit('reprocessed')
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
  // Scales with viewport height (capped at 650px) instead of a fixed floor,
  // so the card doesn't dwarf small mobile viewports; dvh accounts for
  // mobile browser chrome that 100vh ignores.
  minHeight: 'min(650px, 60dvh)',
  maxHeight: 'calc(100dvh - 160px)',
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
  <div class="signal-card rounded-lg border border-ctp-surface1 bg-ctp-mantle transition-colors hover:border-ctp-mauve/50">
    <!-- Card header -->
    <div class="signal-card__header flex items-start gap-3 px-4 py-3">
      <button
        class="min-w-0 flex-1 rounded-lg px-2 py-1.5 text-left transition-colors"
        :aria-expanded="expanded"
        @click="expanded = !expanded"
      >
        <div v-if="subjectLine" class="mb-0.5 truncate text-sm font-semibold text-ctp-text">{{ subjectLine }}</div>
        <div class="flex items-center gap-2">
          <span class="text-sm"><span class="text-ctp-subtext0">From:</span> <span class="text-ctp-text font-medium">{{ fromName }}</span><span v-if="fromAddress" class="ml-1 text-ctp-subtext0">&lt;{{ fromAddress }}&gt;</span></span>
          <span
            v-if="hasSpamWarning"
            class="text-xs text-ctp-peach"
            title="Higher-than-normal spam score"
            >⚠ Possible spam</span
          >
        </div>
        <div v-if="isEmailSignal(signal) && signal.data.to.length > 0" class="text-xs">
          <span class="text-ctp-subtext0">To:</span> <span class="text-ctp-text">{{ signal.data.to.map((a) => a.name ?? a.address).join(', ') }}</span>
        </div>
        <div v-if="isEmailSignal(signal) && signal.data.cc.length > 0" class="text-xs">
          <span class="text-ctp-subtext0">CC:</span> <span class="text-ctp-text">{{ signal.data.cc.map((a) => a.name ?? a.address).join(', ') }}</span>
        </div>
        <div v-if="isBcc" class="text-xs font-medium text-ctp-red">
          ⚠ BCC — alias not in To or CC
        </div>
        <div v-if="replyToLabel" class="text-xs text-ctp-peach" title="Reply-To differs from sender">↩ {{ replyToLabel }}</div>
        <div v-if="envelopeSender" class="flex items-center gap-1 text-xs text-ctp-subtext0" :title="`Envelope: ${envelopeSender}`"><svg class="inline h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> 🛡 Secured by: {{ envelopeSender }}</div>
        <div v-if="attachmentCount > 0" class="text-xs text-ctp-subtext0" :title="`${attachmentCount} attachment${attachmentCount > 1 ? 's' : ''}`">📎 {{ attachmentCount }}</div>
        <div class="text-xs text-ctp-subtext0">{{ sentAt }}</div>
      </button>

      <!-- Undo error inline -->
      <span v-if="undoError" class="mt-1 shrink-0 text-xs text-ctp-red">{{ undoError }}</span>

      <!-- Overflow menu -->
      <div class="relative shrink-0 self-start">
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
            v-if="isEmailSignal(signal)"
            class="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-ctp-subtext1 hover:bg-ctp-surface0 hover:text-ctp-text"
            role="menuitem"
            @click="viewOriginalEmail"
          >
            View original email
          </button>
          <button
            v-if="signalMatchedRules.length"
            class="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-ctp-subtext1 hover:bg-ctp-surface0 hover:text-ctp-text"
            role="menuitem"
            @click="showMatchedRules"
          >
            Show matched rules
          </button>
          <CopyMenuItem
            class="px-4"
            :value="signal.signalId"
            label="Signal ID"
            @click="menuOpen = false"
          />
          <CopyMenuItem
            v-if="threadId"
            class="px-4"
            :value="threadId"
            label="Thread ID"
            @click="menuOpen = false"
          />
          <button
            v-if="isUserSent"
            :disabled="undoPending"
            class="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-ctp-red hover:bg-ctp-surface0 disabled:opacity-50"
            role="menuitem"
            @click="undoSend"
          >
            {{ undoPending ? 'Undoing…' : 'Undo send' }}
          </button>
          <button
            v-if="isAdminUser()"
            :disabled="reprocessing"
            class="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-ctp-subtext1 hover:bg-ctp-surface0 hover:text-ctp-text disabled:opacity-50"
            role="menuitem"
            @click="reprocessSignal"
          >
            {{ reprocessing ? 'Reprocessing…' : '[Admin] Reprocess' }}
          </button>
        </div>

        <!-- Click-outside backdrop -->
        <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions,vuejs-accessibility/click-events-have-key-events -->
        <div v-if="menuOpen" class="fixed inset-0 z-10" @click="menuOpen = false" />
      </div>
    </div>

    <!-- Email body -->
    <template v-if="expanded && signal.type === 'email'">
      <div class="signal-card__body border-t border-ctp-surface1">
        <div
          v-if="reprocessing"
          role="status"
          aria-label="Reprocessing email…"
          class="flex min-h-[min(650px,60dvh)] max-h-[calc(100dvh-160px)] items-center justify-center gap-2 bg-white text-sm text-ctp-subtext0"
        >
          <svg class="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 12a9 9 0 1 1-6.219-8.56" stroke-linecap="round" />
          </svg>
          Reprocessing…
        </div>
        <div
          v-else-if="reprocessError"
          role="alert"
          class="m-4 rounded-lg border border-ctp-red/30 bg-ctp-red/10 px-4 py-3 text-sm text-ctp-red"
        >
          Reprocessing failed: {{ reprocessError }}
        </div>
        <div v-else-if="signal.data.body" class="relative overflow-y-auto bg-white min-h-[min(650px,60dvh)] max-h-[calc(100dvh-160px)]" data-testid="email-body-container">
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
               Only shown when zoomed — at 1× the iframe scrolls natively.
               Touch events that start inside a sandboxed iframe don't bubble
               to the parent document, so this overlay captures gestures. -->
          <div
            v-if="emailScale > 1"
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

    <!-- Signal footer — reply action (always visible, even when collapsed) -->
    <div v-if="signal.type === 'email'" class="flex justify-end border-t border-ctp-surface0 px-4 py-2">
      <button
        class="flex items-center gap-1.5 rounded-lg border border-ctp-surface1 px-3 py-1.5 text-xs text-ctp-subtext1 hover:border-ctp-mauve hover:text-ctp-mauve"
        @click="$emit('reply')"
      >
        <svg class="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M6 3.5L1 8l5 4.5V9.5c4.5 0 7.5 1.5 9 4.5-.5-4.5-3-8-9-8V3.5z"/>
        </svg>
        Reply
      </button>
    </div>


  </div>

  <!-- Raw signal data modal -->
  <Teleport to="body">
    <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions,vuejs-accessibility/click-events-have-key-events -->
    <div v-if="showRawModal" class="fixed inset-0 z-[200] flex items-center justify-center bg-ctp-base/80" @click.self="showRawModal = false">
      <div class="relative max-h-[80vh] w-full max-w-2xl overflow-auto rounded-xl border border-ctp-surface1 bg-ctp-mantle p-4 shadow-2xl">
        <div class="mb-3 flex items-center justify-between">
          <h3 class="text-sm font-semibold text-ctp-text">Headers</h3>
          <div class="flex items-center gap-3">
            <button class="text-xs text-ctp-subtext0 hover:text-ctp-mauve" @click="copyRawJson">{{ rawCopied ? '✓ Copied' : 'Copy' }}</button>
            <button class="text-xs text-ctp-subtext0 hover:text-ctp-text" @click="showRawModal = false">Close</button>
          </div>
        </div>
        <pre class="overflow-auto rounded-lg bg-ctp-base p-3 font-mono text-xs text-ctp-text break-all whitespace-pre-wrap">{{ rawSignalJson }}</pre>
      </div>
    </div>
  </Teleport>

  <!-- Original email modal — raw source from S3 -->
  <Teleport to="body">
    <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions,vuejs-accessibility/click-events-have-key-events -->
    <div v-if="showOriginalModal" class="fixed inset-0 z-[200] flex items-center justify-center bg-ctp-base/80" @click.self="showOriginalModal = false">
      <div class="relative max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-xl border border-ctp-surface1 bg-ctp-mantle shadow-2xl">
        <div class="flex items-center justify-between border-b border-ctp-surface0 bg-ctp-mantle px-4 py-3">
          <h3 class="text-sm font-semibold text-ctp-text">Original email source</h3>
          <div class="flex items-center gap-3">
            <button v-if="originalEmailSource" class="text-xs text-ctp-subtext0 hover:text-ctp-mauve" @click="copyOriginalHtml">{{ originalCopied ? '✓ Copied' : 'Copy source' }}</button>
            <button class="text-xs text-ctp-subtext0 hover:text-ctp-text" @click="showOriginalModal = false">Close</button>
          </div>
        </div>
        <div v-if="originalLoading" class="flex items-center justify-center p-8">
          <span class="text-sm text-ctp-subtext0">Loading…</span>
        </div>
        <div v-else-if="originalError" class="p-4">
          <span class="text-sm text-ctp-red">{{ originalError }}</span>
        </div>
        <pre v-else class="max-h-[80vh] overflow-auto p-4 font-mono text-xs text-ctp-text break-all whitespace-pre-wrap">{{ originalEmailSource }}</pre>
      </div>
    </div>
  </Teleport>

  <!-- Matched rules modal -->
  <Teleport to="body">
    <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions,vuejs-accessibility/click-events-have-key-events -->
    <div v-if="showMatchedRulesModal" class="fixed inset-0 z-[200] flex items-center justify-center bg-ctp-base/80" @click.self="showMatchedRulesModal = false">
      <div class="relative max-h-[80vh] w-full max-w-lg overflow-auto rounded-xl border border-ctp-surface1 bg-ctp-mantle p-4 shadow-2xl">
        <div class="mb-3 flex items-center justify-between">
          <h3 class="text-sm font-semibold text-ctp-text">Matched rules</h3>
          <button class="text-xs text-ctp-subtext0 hover:text-ctp-text" @click="showMatchedRulesModal = false">Close</button>
        </div>
        <div class="divide-y divide-ctp-surface0">
          <div v-for="matched in signalMatchedRules" :key="matched.ruleId" class="py-3">
            <div class="flex flex-wrap items-center gap-2">
              <span class="text-sm font-medium text-ctp-text">
                {{ matched.text ?? ruleFor(matched.ruleId)?.name ?? matched.ruleId }}
              </span>
              <ActionBadge v-for="action in matched.actions" :key="action.type" :type="action.type" />
            </div>
            <div v-if="matched.labelsAdded.length" class="mt-1.5 flex flex-wrap gap-1">
              <span
                v-for="label in matched.labelsAdded"
                :key="label"
                class="rounded bg-ctp-surface1 px-1.5 py-0.5 text-xs text-ctp-subtext1"
              >
                {{ label }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

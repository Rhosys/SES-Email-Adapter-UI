<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import type { Attachment, Signal } from '@/types/server'
import { isEmailSignal, isInboundEmailSignal } from '@/lib/signal-guards'
import { useAccountStore } from '@/stores/account'
import { isAdminUser } from '@/stores/admin'
import { useRulesStore } from '@/stores/rules'
import { useSignalsStore } from '@/stores/signals'
import { api } from '@/lib/api'
import ActionBadge from '@/components/ActionBadge.vue'
import CopyMenuItem from '@/components/CopyMenuItem.vue'
import OverflowMenu from '@/components/ui/OverflowMenu.vue'

const props = withDefaults(defineProps<{ signal: Signal; defaultExpanded?: boolean }>(), { defaultExpanded: true })
const emit = defineEmits<{ undo: []; reply: []; reprocessed: [] }>()

const router = useRouter()
const accountStore = useAccountStore()
const rulesStore = useRulesStore()
const signalsStore = useSignalsStore()
const expanded = ref(props.defaultExpanded)
const reprocessing = ref(false)
const reprocessError = ref<string | null>(null)
const undoPending = ref(false)
const undoError = ref<string | null>(null)
const isUserSent = computed(() => props.signal.source === 'user')
const threadId = computed(() => props.signal.threadId)

const signalMatchedRules = computed(() => {
  if (!isInboundEmailSignal(props.signal)) return []
  return props.signal.data.matchedRules ?? []
})

function ruleFor(ruleId: string) {
  return rulesStore.items.find((r) => r.ruleId === ruleId)
}

function showMatchedRules() {
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

const attachments = computed(() => {
  if (!isEmailSignal(props.signal)) return []
  return props.signal.data.attachments
})

const attachmentCount = computed(() => attachments.value.length)

function formatAttachmentSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function attachmentIcon(mimeType: string): string {
  if (mimeType.startsWith('image/')) return '🖼️'
  if (mimeType === 'application/pdf') return '📄'
  if (mimeType.startsWith('text/') || mimeType === 'application/json') return '📝'
  if (mimeType.includes('spreadsheet') || mimeType === 'text/csv') return '📊'
  if (mimeType.includes('zip') || mimeType.includes('compressed')) return '🗜️'
  return '📎'
}

type AttachmentPreviewKind = 'image' | 'pdf' | 'none'

function attachmentPreviewKind(mimeType: string): AttachmentPreviewKind {
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType === 'application/pdf') return 'pdf'
  return 'none'
}

const previewAttachment = ref<Attachment | null>(null)
const previewKind = computed(() => (previewAttachment.value ? attachmentPreviewKind(previewAttachment.value.mimeType) : 'none'))

function openAttachmentPreview(att: Attachment) {
  if (!att.url) return
  previewAttachment.value = att
}

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
  showOriginalModal.value = true
  originalError.value = null

  if (originalEmailSource.value) return

  if (!accountStore.accountId || !props.signal.threadId) return
  originalLoading.value = true
  void api.getRawEmail(accountStore.accountId, props.signal.threadId, props.signal.signalId).then((result) => {
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
  if (!accountStore.accountId || !props.signal.threadId || undoPending.value) return
  undoPending.value = true
  undoError.value = null
  const result = await api.patchSignal(accountStore.accountId, props.signal.threadId, props.signal.signalId, { status: 'draft' })
  undoPending.value = false
  if (result.isOk()) {
    emit('undo')
  } else {
    undoError.value = 'Email already delivered — cannot undo'
  }
}

async function reprocessSignal() {
  if (!accountStore.accountId || !props.signal.threadId || reprocessing.value) return
  reprocessing.value = true
  reprocessError.value = null

  const result = await api.reprocessSignal(accountStore.accountId, props.signal.threadId, props.signal.signalId)

  if (result.isErr()) {
    reprocessing.value = false
    reprocessError.value = result.error.message
    return
  }

  const newSignal = result.value
  const originThreadId = props.signal.threadId

  // Whenever reprocessing moves the signal off its original thread, drop the stale
  // copy from that thread's cache so the old thread no longer shows it. Threads left
  // with no signals (null lastSignalAt) are hidden by the threads store itself.
  function detachFromOriginThread() {
    if (!originThreadId) return
    signalsStore.removeSignal(originThreadId, props.signal.signalId)
  }

  // Blocked / reported signals don't belong to any thread or quarantine screen the
  // admin can view — send them back to the inbox.
  if (newSignal.status === 'block_hidden' || newSignal.status === 'block_reject' || newSignal.status === 'report_violation') {
    detachFromOriginThread()
    void router.push('/')
    return
  }

  // No thread means the signal landed in quarantine.
  if (!newSignal.threadId) {
    detachFromOriginThread()
    void router.push(`/quarantine/${newSignal.signalId}`)
    return
  }

  if (newSignal.threadId !== originThreadId) {
    detachFromOriginThread()
    void router.replace(`/threads/${newSignal.threadId}`)
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
  } catch (e) {
    // Cross-origin sandbox blocked contentDocument access — keep CSS min-height.
    // This is expected often enough (by design) that it's logged locally only,
    // not through the app logger, to avoid spamming remote logs.
    // eslint-disable-next-line no-console
    console.debug('[EmailSignalCard] iframe auto-height skipped', e)
  }
}

// Wrap the raw email HTML so wide content reflows to the viewport instead of
// overflowing horizontally on mobile. The iframe sandbox has no
// allow-same-origin, so the parent page cannot reach into the email document
// with CSS — the only lever is the srcdoc string itself, so the fix is a
// <style>/<meta viewport> block injected ahead of the email markup.
//
// Emails are rarely valid documents, so all three shapes show up in practice:
// a real <head>, a bare <html> wrapper, or just a soup of tags with neither.
function wrapEmailHtml(rawHtml: string): string {
  const markup = `<meta name="viewport" content="width=device-width, initial-scale=1"><style>
    html, body { overflow-x: hidden !important; }
    * { max-width: 100% !important; box-sizing: border-box !important; }
    img, video, svg { height: auto !important; }
    table { width: auto !important; }
    body, p, span, div, td, th, a, li {
      word-wrap: break-word !important;
      overflow-wrap: break-word !important;
      word-break: break-word !important;
    }
    pre { white-space: pre-wrap !important; }
  </style>`

  const headMatch = /<head[^>]*>/i.exec(rawHtml)
  if (headMatch) {
    const idx = headMatch.index + headMatch[0].length
    return rawHtml.slice(0, idx) + markup + rawHtml.slice(idx)
  }
  const htmlMatch = /<html[^>]*>/i.exec(rawHtml)
  if (htmlMatch) {
    const idx = htmlMatch.index + htmlMatch[0].length
    return rawHtml.slice(0, idx) + `<head>${markup}</head>` + rawHtml.slice(idx)
  }
  return `<!doctype html><html><head>${markup}</head><body>${rawHtml}</body></html>`
}

const emailSrcDoc = computed(() => {
  if (!isEmailSignal(props.signal) || !props.signal.data.body) return ''
  return wrapEmailHtml(props.signal.data.body)
})

// --- Email body iframe ---
//
// The iframe is left to the browser's native touch handling: single-finger
// scrolling, link taps, and text selection all work because nothing sits on
// top of it. Pinch-to-zoom is the browser's native page zoom (the app viewport
// permits user scaling), so the email magnifies without any custom gesture
// layer. An earlier version wrapped the iframe in a transparent overlay to run
// a custom pinch/double-tap/swipe system, but that overlay swallowed every
// native touch — the source of the "can't scroll/tap/select" bug — and could
// not be made to pass single-finger touches through while still catching a
// pinch (touches starting inside a sandboxed iframe never reach the parent).
const iframeStyle = {
  // Scales with viewport height (capped at 650px) instead of a fixed floor,
  // so the card doesn't dwarf small mobile viewports; dvh accounts for
  // mobile browser chrome that 100vh ignores.
  minHeight: 'min(650px, 60dvh)',
  maxHeight: 'calc(100dvh - 160px)',
  border: 'none',
  display: 'block',
}
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
        <div
          v-if="replyToLabel"
          class="flex items-center gap-1 pl-4 text-xs text-ctp-peach"
          title="Sender Requires Alternative Reply To Address"
        >
          <svg class="inline h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M6 5 V10 a3 3 0 0 0 3 3 H18" />
            <path d="M15 9 l4 4 -4 4" />
          </svg>
          <span class="min-w-0 truncate">{{ replyToLabel }}</span>
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
        <div v-if="envelopeSender" class="flex items-center gap-1 text-xs text-ctp-subtext0" :title="`Envelope: ${envelopeSender}`"><svg class="inline h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> 🛡 Secured by: {{ envelopeSender }}</div>
        <div v-if="attachmentCount > 0" class="text-xs text-ctp-subtext0" :title="`${attachmentCount} attachment${attachmentCount > 1 ? 's' : ''}`">📎 {{ attachmentCount }}</div>
        <div class="text-xs text-ctp-subtext0">{{ sentAt }}</div>
      </button>

      <!-- Undo error inline -->
      <span v-if="undoError" class="mt-1 shrink-0 text-xs text-ctp-red">{{ undoError }}</span>

      <!-- Overflow menu -->
      <OverflowMenu
        class="shrink-0 self-start"
        label="Signal actions"
        sheet-title="Signal actions"
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
        <CopyMenuItem class="px-4" :value="signal.signalId" label="Signal ID" />
        <CopyMenuItem v-if="threadId" class="px-4" :value="threadId" label="Thread ID" />
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
      </OverflowMenu>
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
        <div v-else-if="signal.data.body">
          <!-- Native touch handling: no overlay sits on the iframe, so scroll,
               link taps, text selection and pinch-to-zoom all work directly. -->
          <div class="overflow-y-auto bg-white min-h-[min(650px,60dvh)] max-h-[calc(100dvh-160px)]" data-testid="email-body-container">
            <!--
              SECURITY — the sandbox below renders UNTRUSTED email HTML. Do not
              add `allow-scripts` or `allow-same-origin` (enforced by
              EmailSignalCard.sandbox.test.ts). Why each is dangerous here:

              • allow-scripts — lets the email run arbitrary JS in the user's
                session. That alone is an XSS; combined with allow-same-origin it
                also lets the frame delete its own sandbox and fully escape.

              • allow-same-origin — makes this srcdoc frame share the app's
                origin instead of a unique opaque one. Two consequences:
                (1) our cookies are on this domain, and a same-origin frame is
                treated as SAME-SITE, so `SameSite=Lax/Strict` cookies would be
                attached to any request the email triggers (e.g. `<img src>`,
                CSS url()) — a credentialed CSRF vector, no JS required, and
                HttpOnly does not help (the browser still sends the cookie).
                Today the opaque origin is cross-site, so SameSite blocks this.
                (2) it grants the frame access to same-origin storage/DOM (only
                reachable via script, but it removes the second safety net).

              The one feature these would have bought — pinch-to-zoom scoped to
              just the email — is intentionally NOT worth this exposure. Pinch
              uses the browser's native page zoom instead. See PR #47 discussion.
            -->
            <iframe
              :srcdoc="emailSrcDoc"
              sandbox="allow-popups allow-popups-to-escape-sandbox"
              referrerpolicy="no-referrer"
              class="w-full"
              :style="iframeStyle"
              title="Email content"
              @load="fitHeight"
            />
          </div>
        </div>
        <p v-else class="px-4 py-3 text-sm text-ctp-subtext0">(No content)</p>

        <div v-if="attachments.length > 0" class="flex flex-wrap gap-2 border-t border-ctp-surface0 px-4 py-3">
          <template v-for="att in attachments" :key="att.attachmentId">
            <button
              v-if="att.url"
              type="button"
              class="flex items-center gap-2 rounded-lg border border-ctp-surface1 px-3 py-1.5 text-xs text-ctp-text hover:border-ctp-mauve"
              @click="openAttachmentPreview(att)"
            >
              <span aria-hidden="true">{{ attachmentIcon(att.mimeType) }}</span>
              <span class="max-w-[180px] truncate" :title="att.filename">{{ att.filename }}</span>
              <span class="text-ctp-subtext0">{{ formatAttachmentSize(att.sizeBytes) }}</span>
            </button>
            <span
              v-else
              class="flex items-center gap-2 rounded-lg border border-dashed border-ctp-surface1 px-3 py-1.5 text-xs text-ctp-subtext0"
              :title="`${att.filename} — unavailable`"
            >
              <span aria-hidden="true">{{ attachmentIcon(att.mimeType) }}</span>
              <span class="max-w-[180px] truncate">{{ att.filename }}</span>
              <span>Unavailable</span>
            </span>
          </template>
        </div>
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

  <!-- Attachment preview modal -->
  <Teleport to="body">
    <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions,vuejs-accessibility/click-events-have-key-events -->
    <div v-if="previewAttachment" class="fixed inset-0 z-[200] flex items-center justify-center bg-ctp-base/80" @click.self="previewAttachment = null">
      <div class="relative flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-ctp-surface1 bg-ctp-mantle shadow-2xl">
        <div class="flex items-center justify-between border-b border-ctp-surface0 bg-ctp-mantle px-4 py-3">
          <h3 class="truncate text-sm font-semibold text-ctp-text" :title="previewAttachment.filename">
            {{ attachmentIcon(previewAttachment.mimeType) }} {{ previewAttachment.filename }}
          </h3>
          <div class="flex shrink-0 items-center gap-3">
            <a
              :href="previewAttachment.url"
              :download="previewAttachment.filename"
              class="rounded-lg bg-ctp-mauve px-3 py-1.5 text-xs font-medium text-ctp-base hover:opacity-90"
            >
              Download
            </a>
            <button class="text-xs text-ctp-subtext0 hover:text-ctp-text" @click="previewAttachment = null">Close</button>
          </div>
        </div>
        <div class="flex-1 overflow-auto bg-ctp-crust">
          <img
            v-if="previewKind === 'image'"
            :src="previewAttachment.url"
            :alt="previewAttachment.filename"
            class="mx-auto max-h-[80vh] max-w-full object-contain"
          />
          <iframe
            v-else-if="previewKind === 'pdf'"
            :src="previewAttachment.url"
            :title="previewAttachment.filename"
            class="h-[80vh] w-full"
          />
          <div v-else class="flex h-[40vh] flex-col items-center justify-center gap-2 text-center text-sm text-ctp-subtext0">
            <span class="text-4xl" aria-hidden="true">{{ attachmentIcon(previewAttachment.mimeType) }}</span>
            <p>No preview available for this file type.</p>
            <p>{{ formatAttachmentSize(previewAttachment.sizeBytes) }} — use Download to save it.</p>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { marked } from 'marked'
import { useAccountStore } from '@/stores/account'
import { useSignalsStore } from '@/stores/signals'
import { useUserConfigStore } from '@/stores/userConfig'
import { api } from '@/lib/api'
import { useToast } from '@/composables/useToast'
import { useDeferredHide } from '@/composables/useDeferredHide'
import type { Signal, Domain, Alias, ExternalMailExchange } from '@/types/server'
import { isEmailSignal, isInboundEmailSignal } from '@/lib/signal-guards'
import AsyncButton from '@/components/ui/AsyncButton.vue'

const props = defineProps<{ signal: Signal }>()
const emit = defineEmits<{ discard: []; sent: [] }>()

const accountStore = useAccountStore()
const signalsStore = useSignalsStore()
const userConfigStore = useUserConfigStore()
const router = useRouter()
const { deferAction, undo: undoToast } = useToast()
const { hideWithDefer } = useDeferredHide()

const shouldReturnToInbox = computed(() => userConfigStore.postSendView === 'return_to_inbox')

// Sentinel option: compose an address the account can send from that isn't in the list
const CUSTOM_FROM = '__custom__'

// Parse existing from address (empty for brand-new drafts)
function splitAddress(address: string): [string, string] {
  const at = address.indexOf('@')
  return at >= 0 ? [address.slice(0, at), address.slice(at + 1)] : ['', '']
}

function domainOf(address: string): string {
  return splitAddress(address)[1].toLowerCase()
}

const emailData = isEmailSignal(props.signal) ? props.signal.data : null
const [initLocal, initDomain] = splitAddress(emailData?.from?.address ?? '')
const localPart = ref(initLocal)
const selectedDomain = ref(initDomain)
const selectedFrom = ref('')
const subject = ref(emailData?.subject ?? '')
const body = ref(emailData?.body ?? '')

const expanded = ref(true)
const showPreview = ref(false)
const domains = ref<Domain[]>([])
const aliases = ref<Alias[]>([])
const exchanges = ref<ExternalMailExchange[]>([])
const sendersLoaded = ref(false)
const saving = ref(false)
const sendState = ref<'idle' | 'sending' | 'cancellable'>('idle')
const toastId = ref<string | null>(null)
const error = ref<string | null>(null)

const verifiedDomains = computed(() => domains.value.filter((d) => d.senderSetupComplete))
const verifiedDomainNames = computed(
  () => new Set(verifiedDomains.value.map((d) => d.domain.toLowerCase())),
)

// Aliases sit on our own domains, so they're only sendable once the domain's
// sender setup is verified.
const aliasOptions = computed(() =>
  aliases.value.map((a) => a.alias).filter((a) => verifiedDomainNames.value.has(domainOf(a))),
)

// IMAP/JMAP mailboxes are whole addresses on domains we don't own — they can't be
// built from a local part plus one of our domains, so they're offered verbatim.
const mailboxOptions = computed(() =>
  exchanges.value
    .filter((e) => (e.platform === 'imap' || e.platform === 'jmap') && e.status === 'active' && e.emailAddress)
    .map((e) => e.emailAddress),
)

const addressOptions = computed(() => [...aliasOptions.value, ...mailboxOptions.value])
const canPickCustom = computed(() => verifiedDomains.value.length > 0)
const hasSendableAddress = computed(() => addressOptions.value.length > 0 || canPickCustom.value)
const isCustomFrom = computed(() => selectedFrom.value === CUSTOM_FROM)

const fromAddress = computed(() => {
  if (!isCustomFrom.value) return selectedFrom.value
  return localPart.value && selectedDomain.value ? `${localPart.value}@${selectedDomain.value}` : ''
})

// The address this thread arrived on — the reply should go back out from it. The
// draft signal carries it already (the store seeds `from` on create); fall back to
// the newest inbound signal for drafts created without one.
const originalRecipient = computed(() => {
  const seeded = emailData?.from?.address
  if (seeded) return seeded
  const threadId = props.signal.threadId
  if (!threadId) return ''
  const inbound = signalsStore.threadSignals(threadId).find(isInboundEmailSignal)
  return inbound?.data.recipientAddress ?? ''
})

/**
 * Picks the From entry matching the original recipient: a listed alias or connected
 * mailbox when one matches outright, otherwise the custom local-part + domain editor
 * when the address sits on a verified domain (an unregistered catch-all address).
 * Falls back to the first sendable address when nothing lines up.
 */
function selectInitialFrom() {
  const original = originalRecipient.value
  const match = addressOptions.value.find((a) => a.toLowerCase() === original.toLowerCase())
  if (match) {
    selectedFrom.value = match
    return
  }

  const domain = verifiedDomains.value.find((d) => d.domain.toLowerCase() === domainOf(original))
  if (original && domain) {
    localPart.value = splitAddress(original)[0]
    selectedDomain.value = domain.domain
    selectedFrom.value = CUSTOM_FROM
    return
  }

  if (addressOptions.value.length > 0) {
    selectedFrom.value = addressOptions.value[0]!
    return
  }
  if (canPickCustom.value) {
    if (!selectedDomain.value) selectedDomain.value = verifiedDomains.value[0]!.domain
    selectedFrom.value = CUSTOM_FROM
  }
}

const previewHtml = computed(() => (body.value ? (marked.parse(body.value) as string) : ''))

const canSend = computed(
  () =>
    sendState.value === 'idle' &&
    !!fromAddress.value &&
    subject.value.trim().length > 0 &&
    body.value.trim().length > 0,
)

const toLabel = computed(() => emailData?.to?.map((e) => e.address).join(', ') ?? '')

onMounted(async () => {
  if (!accountStore.accountId) return
  const accountId = accountStore.accountId
  const [domainResult, aliasResult, exchangeResult] = await Promise.all([
    api.listDomains(accountId),
    api.listAliases(accountId),
    api.listExternalExchanges(accountId),
  ])
  if (domainResult.isOk()) domains.value = domainResult.value
  if (aliasResult.isOk()) aliases.value = aliasResult.value
  // A missing/failed exchange list just means no external mailboxes to send from.
  if (exchangeResult.isOk()) exchanges.value = exchangeResult.value
  selectInitialFrom()
  sendersLoaded.value = true
})

// Switching to the custom editor needs a domain selected, or its dropdown opens blank.
watch(selectedFrom, (value) => {
  if (value === CUSTOM_FROM && !selectedDomain.value && verifiedDomains.value.length > 0) {
    selectedDomain.value = verifiedDomains.value[0]!.domain
  }
})

let saveTimer: ReturnType<typeof setTimeout> | null = null

watch([fromAddress, subject, body], () => {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => void persistDraft(), 900)
})

// Mirrors what the server holds, so resolving the From address on load doesn't
// trigger a save when it lands on the value the draft already had.
let persisted = {
  from: emailData?.from?.address ?? '',
  subject: emailData?.subject ?? '',
  body: emailData?.body ?? '',
}

async function persistDraft() {
  if (!accountStore.accountId) return
  const threadId = props.signal.threadId
  if (!threadId) return
  const pending = { from: fromAddress.value, subject: subject.value, body: body.value }
  if (
    pending.from === persisted.from &&
    pending.subject === persisted.subject &&
    pending.body === persisted.body
  ) {
    return
  }
  saving.value = true
  const result = await api.updateDraftSignal(accountStore.accountId, threadId, props.signal.signalId, {
    from: fromAddress.value ? { address: fromAddress.value } : undefined,
    subject: subject.value,
    textBody: body.value,
  })
  saving.value = false
  if (result.isErr()) {
    error.value = result.error.message
    return
  }
  persisted = pending
  if (props.signal.threadId) signalsStore.updateSignal(props.signal.threadId, result.value)
}

async function sendAndArchive() {
  if (!accountStore.accountId || !canSend.value) return
  error.value = null
  await persistDraft()

  const accountId = accountStore.accountId
  const signalId = props.signal.signalId
  const sigThreadId = props.signal.threadId
  if (!sigThreadId) return

  sendState.value = 'cancellable'
  if (shouldReturnToInbox.value) void router.push('/')

  const id = hideWithDefer(
    sigThreadId,
    'Email sent + archived',
    async () => {
      const result = await api.sendSignal(accountId, sigThreadId, signalId)
      if (result.isOk()) {
        signalsStore.updateSignal(sigThreadId, result.value)
        await api.patchThread(accountId, sigThreadId, { status: 'archived' })
      }
      sendState.value = 'idle'
      toastId.value = null
      emit('sent')
    },
    8_000,
    {
      submessage: `To: ${toLabel.value}`,
      undoLabel: 'Cancel send',
    },
  )
  toastId.value = id
}

async function sendAndWait() {
  if (!accountStore.accountId || !canSend.value) return
  error.value = null
  await persistDraft()

  const accountId = accountStore.accountId
  const signalId = props.signal.signalId
  const sigThreadId = props.signal.threadId
  if (!sigThreadId) return

  sendState.value = 'cancellable'
  if (shouldReturnToInbox.value) void router.push('/')

  const followupAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  const id = deferAction(
    'Email sent — follow up in 7 days',
    async () => {
      const result = await api.sendSignal(accountId, sigThreadId, signalId)
      if (result.isOk()) {
        signalsStore.updateSignal(sigThreadId, result.value)
        await api.patchThread(accountId, sigThreadId, { followupAt })
      }
      sendState.value = 'idle'
      toastId.value = null
      emit('sent')
    },
    8_000,
    {
      submessage: `To: ${toLabel.value}`,
      undoLabel: 'Cancel send',
    },
  )
  toastId.value = id
}

function cancelSend() {
  if (toastId.value) undoToast(toastId.value)
}

async function discard() {
  if (!accountStore.accountId || !props.signal.threadId) return
  const result = await api.deleteDraftSignal(accountStore.accountId, props.signal.threadId, props.signal.signalId)
  // Remove from local cache on success or 404 (already gone on server)
  if (result.isOk() || result.error.status === 404) {
    if (props.signal.threadId) signalsStore.removeSignal(props.signal.threadId, props.signal.signalId)
  }
  emit('discard')
}
</script>

<template>
  <div class="rounded-lg border border-ctp-mauve/40 bg-ctp-mantle">
    <!-- Collapsed header -->
    <button
      class="flex w-full items-center justify-between px-4 py-3 text-left"
      @click="expanded = !expanded"
    >
      <div class="flex min-w-0 flex-1 items-center gap-2">
        <span class="shrink-0 rounded-full bg-ctp-mauve/20 px-2 py-0.5 text-xs text-ctp-mauve">
          Draft
        </span>
        <span class="truncate text-sm text-ctp-subtext1">
          {{ subject || toLabel || 'New draft' }}
        </span>
        <span v-if="saving" class="shrink-0 text-xs text-ctp-subtext0">saving…</span>
      </div>
      <span class="ml-2 shrink-0 text-xs text-ctp-subtext0">{{ expanded ? '▲' : '▼' }}</span>
    </button>

    <!-- Editor -->
    <div v-if="expanded" class="border-t border-ctp-mauve/20 px-4 pb-4 pt-3">
      <!-- Error -->
      <div
        v-if="error"
        class="mb-3 rounded border border-ctp-red bg-ctp-red/10 px-3 py-2 text-xs text-ctp-red"
      >
        {{ error }}
        <button class="ml-1 underline" @click="error = null">Dismiss</button>
      </div>

      <!-- To (read-only) -->
      <div class="mb-2 text-xs text-ctp-subtext0">
        <span class="font-medium">To:</span> {{ toLabel }}
      </div>

      <!-- From: alias / connected mailbox / custom local-part @ domain -->
      <div v-if="sendersLoaded" class="mb-2">
        <template v-if="!hasSendableAddress">
          <div
            class="rounded border border-ctp-yellow/40 bg-ctp-yellow/10 px-3 py-2 text-xs text-ctp-yellow"
          >
            <span class="font-medium">No verified sending address.</span>
            You need a verified domain or a connected IMAP/JMAP mailbox before you can send replies.
            <router-link to="/settings/email-forwarding?tab=domains" class="underline hover:text-ctp-text">
              Add one in Settings → Domains.
            </router-link>
          </div>
        </template>
        <template v-else>
          <label for="draft-from" class="mb-1 block text-xs text-ctp-subtext0">From</label>
          <select
            id="draft-from"
            v-model="selectedFrom"
            class="w-full rounded border border-ctp-surface1 bg-ctp-base px-2 py-1.5 text-xs text-ctp-text focus:border-ctp-mauve focus:outline-none"
          >
            <optgroup v-if="aliasOptions.length > 0" label="Aliases">
              <option v-for="address in aliasOptions" :key="address" :value="address">
                {{ address }}
              </option>
            </optgroup>
            <optgroup v-if="mailboxOptions.length > 0" label="Connected mailboxes">
              <option v-for="address in mailboxOptions" :key="address" :value="address">
                {{ address }}
              </option>
            </optgroup>
            <option v-if="canPickCustom" :value="CUSTOM_FROM">Custom address…</option>
          </select>

          <div
            v-if="isCustomFrom"
            class="mt-1.5 flex items-center rounded border border-ctp-surface1 bg-ctp-base focus-within:border-ctp-mauve"
          >
            <input
              id="draft-from-local"
              v-model="localPart"
              type="text"
              placeholder="you"
              aria-label="Custom address local part"
              class="min-w-0 flex-1 bg-transparent px-2 py-1.5 text-xs text-ctp-text placeholder:text-ctp-subtext0 focus:outline-none"
            />
            <span class="shrink-0 text-xs text-ctp-subtext0">@</span>
            <select
              v-model="selectedDomain"
              aria-label="Domain"
              class="shrink-0 bg-transparent py-1.5 pr-2 text-xs text-ctp-text focus:outline-none"
            >
              <option v-for="d in verifiedDomains" :key="d.domainId" :value="d.domain">
                {{ d.domain }}
              </option>
            </select>
          </div>
        </template>
      </div>

      <!-- Subject -->
      <div class="mb-3">
        <label for="draft-subject" class="mb-1 block text-xs text-ctp-subtext0">Subject</label>
        <input
          id="draft-subject"
          v-model="subject"
          type="text"
          class="w-full rounded border border-ctp-surface1 bg-ctp-base px-2 py-1.5 text-xs text-ctp-text focus:border-ctp-mauve focus:outline-none"
        />
      </div>

      <!-- Body: edit / preview tabs -->
      <div class="mb-3">
        <div class="mb-1 flex items-center gap-3">
          <label for="draft-body" class="text-xs text-ctp-subtext0">Body (markdown)</label>
          <div class="ml-auto flex gap-1">
            <button
              class="rounded px-2 py-0.5 text-xs transition-colors"
              :class="
                !showPreview
                  ? 'bg-ctp-surface1 text-ctp-text'
                  : 'text-ctp-subtext0 hover:text-ctp-text'
              "
              @click="showPreview = false"
            >
              Edit
            </button>
            <button
              class="rounded px-2 py-0.5 text-xs transition-colors"
              :class="
                showPreview
                  ? 'bg-ctp-surface1 text-ctp-text'
                  : 'text-ctp-subtext0 hover:text-ctp-text'
              "
              @click="showPreview = true"
            >
              Preview
            </button>
          </div>
        </div>

        <!-- Edit mode -->
        <textarea
          v-if="!showPreview"
          id="draft-body"
          v-model="body"
          rows="8"
          placeholder="Write your reply in markdown…"
          class="w-full resize-y rounded border border-ctp-surface1 bg-ctp-base px-3 py-2 font-mono text-sm text-ctp-text placeholder:text-ctp-subtext0 focus:border-ctp-mauve focus:outline-none"
        />

        <!-- Preview mode — sandboxed to avoid XSS from rendered markdown -->
        <iframe
          v-else
          :srcdoc="
            previewHtml ||
            '<p style=\'color:#6c7086;font-family:sans-serif;font-size:13px\'>Nothing to preview yet.</p>'
          "
          sandbox="allow-popups allow-popups-to-escape-sandbox"
          class="min-h-32 w-full rounded border border-ctp-surface1 bg-ctp-base"
          style="border: none"
          title="Markdown preview"
        />
      </div>

      <!-- Actions — discard on the left, send actions on the right -->
      <div class="flex flex-wrap items-center gap-3">
        <template v-if="sendState === 'cancellable'">
          <span class="text-sm text-ctp-subtext0">Sent — undo from the toast…</span>
          <button
            class="ml-auto rounded-lg border border-ctp-red/50 px-3 py-1.5 text-sm font-medium text-ctp-red hover:bg-ctp-red/10"
            @click="cancelSend"
          >
            Undo send
          </button>
        </template>
        <template v-else>
          <AsyncButton
            :action="discard"
            class="rounded-lg border border-ctp-surface1 px-3 py-1.5 text-sm text-ctp-subtext0 hover:border-ctp-red hover:text-ctp-red"
          >
            Discard draft
          </AsyncButton>
          <div class="ml-auto flex flex-wrap items-center gap-2">
            <AsyncButton
              :action="sendAndWait"
              :disabled="!canSend"
              class="gap-1.5 rounded-lg border border-ctp-mauve/50 px-3 py-1.5 text-sm font-medium text-ctp-mauve hover:bg-ctp-mauve/10"
            >
              <svg class="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm.5 3v4.2l3 1.8-.5.9-3.5-2.1V4h1z"/>
              </svg>
              Send + Wait
            </AsyncButton>
            <AsyncButton
              :action="sendAndArchive"
              :disabled="!canSend"
              class="gap-1.5 rounded-lg bg-ctp-mauve px-3 py-1.5 text-sm font-medium text-ctp-base hover:opacity-90"
            >
              <svg class="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <path d="M1.5 2h13l-1 2H2.5L1.5 2zm.5 3h12v9a1 1 0 01-1 1H3a1 1 0 01-1-1V5zm4 2v5h5V7H6z"/>
              </svg>
              Send + Archive
            </AsyncButton>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

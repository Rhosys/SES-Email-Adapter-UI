<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { marked } from 'marked'
import { useAccountStore } from '@/stores/account'
import { useSignalsStore } from '@/stores/signals'
import { useUserConfigStore } from '@/stores/userConfig'
import { useSenderIdentitiesStore } from '@/stores/senderIdentities'
import { api } from '@/lib/api'
import { useToast } from '@/composables/useToast'
import { useDeferredHide } from '@/composables/useDeferredHide'
import type { Signal } from '@/types/server'
import { isEmailSignal, isInboundEmailSignal } from '@/lib/signal-guards'
import AsyncButton from '@/components/ui/AsyncButton.vue'

const props = defineProps<{ signal: Signal }>()
const emit = defineEmits<{ discard: []; sent: [] }>()

const accountStore = useAccountStore()
const signalsStore = useSignalsStore()
const userConfigStore = useUserConfigStore()
const senderIdentities = useSenderIdentitiesStore()
const router = useRouter()
const { deferAction, undo: undoToast } = useToast()
const { hideWithDefer } = useDeferredHide()

const shouldReturnToInbox = computed(() => userConfigStore.postSendView === 'return_to_inbox')

// Sentinel option: compose an address on one of our domains rather than pick a mailbox
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

// The address this thread arrived on — the reply goes back out from it. The draft
// signal carries it already (the store seeds `from` on create); fall back to the
// newest inbound signal for drafts created without one. Known synchronously, so the
// sender renders immediately instead of waiting on any request.
const seededFrom = (() => {
  const seeded = emailData?.from?.address
  if (seeded) return seeded
  const threadId = props.signal.threadId
  if (!threadId) return ''
  const inbound = signalsStore.threadSignals(threadId).find(isInboundEmailSignal)
  return inbound?.data.recipientAddress ?? ''
})()

// The authoritative From value. Editing writes back into it; nothing else derives it.
const fromAddress = ref(seededFrom)
const editingFrom = ref(false)

const [initLocal, initDomain] = splitAddress(seededFrom)
const localPart = ref(initLocal)
const selectedDomain = ref(initDomain)
const selectedFrom = ref('')
const subject = ref(emailData?.subject ?? '')
const body = ref(emailData?.body ?? '')

const expanded = ref(true)
const showPreview = ref(false)
const saving = ref(false)
const sendState = ref<'idle' | 'sending' | 'cancellable'>('idle')
const toastId = ref<string | null>(null)
const error = ref<string | null>(null)

const verifiedDomains = computed(() => senderIdentities.domains.filter((d) => d.senderSetupComplete))

// Connected mailboxes are whole addresses on domains we don't own, whatever the
// platform — they can't be built from a local part plus one of our domains, so
// they're offered verbatim.
const mailboxOptions = computed(() =>
  senderIdentities.exchanges.filter((e) => e.status === 'active' && e.emailAddress).map((e) => e.emailAddress),
)

// Aliases are only suggested for the domain being composed on — the full account-wide
// list runs to hundreds of entries and is useless as a dropdown.
const aliasSuggestions = computed(() => {
  const domain = selectedDomain.value.toLowerCase()
  if (!domain) return []
  return senderIdentities.aliases
    .filter((a) => domainOf(a.alias) === domain)
    .map((a) => splitAddress(a.alias)[0])
})

const canPickCustom = computed(() => verifiedDomains.value.length > 0)
const hasSendableAddress = computed(() => mailboxOptions.value.length > 0 || canPickCustom.value)
const isCustomFrom = computed(() => selectedFrom.value === CUSTOM_FROM)

const editedAddress = computed(() => {
  if (!isCustomFrom.value) return selectedFrom.value
  return localPart.value && selectedDomain.value ? `${localPart.value}@${selectedDomain.value}` : ''
})

// Warms the shared sender-identities store as soon as the card exists, in the
// background — this never blocks the fixed From display above, and it's shared
// across every draft card, so by the time a pencil is clicked the data has
// usually already arrived (or come straight from the persisted cache).
senderIdentities.ensureLoaded()

// If the editor is opened before that fetch resolves, pick up the result the
// moment it lands rather than leaving the editor stuck on "Loading addresses…".
watch(
  () => senderIdentities.hasData,
  (loaded) => {
    if (loaded && editingFrom.value) selectCurrentIdentity()
  },
)

/** Opens the sender editor, pointing it at the current address once identities are available. */
function startEditingFrom() {
  editingFrom.value = true
  senderIdentities.ensureLoaded()
  if (senderIdentities.hasData) selectCurrentIdentity()
}

/**
 * Points the editor at whatever the From address already is: the matching connected
 * mailbox when there is one, otherwise the local-part + domain editor. Falls back to
 * the first sendable identity when the current address can't be sent from at all.
 */
function selectCurrentIdentity() {
  const current = fromAddress.value
  const mailbox = mailboxOptions.value.find((a) => a.toLowerCase() === current.toLowerCase())
  if (mailbox) {
    selectedFrom.value = mailbox
    return
  }

  const domain = verifiedDomains.value.find((d) => d.domain.toLowerCase() === domainOf(current))
  if (current && domain) {
    localPart.value = splitAddress(current)[0]
    selectedDomain.value = domain.domain
    selectedFrom.value = CUSTOM_FROM
    return
  }

  if (canPickCustom.value) {
    if (!verifiedDomains.value.some((d) => d.domain === selectedDomain.value)) {
      selectedDomain.value = verifiedDomains.value[0]!.domain
    }
    selectedFrom.value = CUSTOM_FROM
    return
  }
  if (mailboxOptions.value.length > 0) selectedFrom.value = mailboxOptions.value[0]!
}

function applyFrom() {
  if (editedAddress.value) fromAddress.value = editedAddress.value
  editingFrom.value = false
}

function cancelEditingFrom() {
  editingFrom.value = false
  selectCurrentIdentity()
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

// Persist a From resolved from the thread's inbound signal — the draft itself was
// created without one, so the server doesn't know it yet.
onMounted(() => void persistDraft())

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

      <!-- From — the address the thread arrived on, shown straight away. Editing it is
           the rare case, so the pickable identities only load when the pencil is used. -->
      <div class="mb-2">
        <span class="mb-1 block text-xs text-ctp-subtext0">From</span>

        <div v-if="!editingFrom" class="flex items-center gap-1.5">
          <span class="min-w-0 truncate text-xs text-ctp-text">
            {{ fromAddress || 'No sender address chosen' }}
          </span>
          <button
            type="button"
            aria-label="Change sender address"
            title="Change sender address"
            class="shrink-0 rounded p-1 text-ctp-subtext0 hover:text-ctp-mauve"
            @click="startEditingFrom"
          >
            <svg class="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M11.5 1.5l3 3L5 14H2v-3l9.5-9.5zm-8 10.1V12.5h.9l7.2-7.2-.9-.9-7.2 7.2z"/>
            </svg>
          </button>
        </div>

        <!-- Only the true cold-start (no cache, first fetch still in flight) blocks here.
             Once identities have loaded once this session, a later background refresh
             (senderIdentities.loading) never re-shows this — the list underneath just
             updates in place. -->
        <div v-else-if="!senderIdentities.hasData" class="text-xs text-ctp-subtext0">Loading addresses…</div>

        <template v-else>
          <div
            v-if="!hasSendableAddress"
            class="rounded border border-ctp-yellow/40 bg-ctp-yellow/10 px-3 py-2 text-xs text-ctp-yellow"
          >
            <span class="font-medium">No verified sending address.</span>
            You need a verified domain or a connected mailbox before you can send replies.
            <router-link to="/settings/email-forwarding?tab=domains" class="underline hover:text-ctp-text">
              Add one in Settings → Domains.
            </router-link>
          </div>

          <template v-else>
            <label for="draft-from" class="sr-only">Sender address</label>
            <select
              id="draft-from"
              v-model="selectedFrom"
              class="w-full rounded border border-ctp-surface1 bg-ctp-base px-2 py-1.5 text-xs text-ctp-text focus:border-ctp-mauve focus:outline-none"
            >
              <optgroup v-if="mailboxOptions.length > 0" label="Connected mailboxes">
                <option v-for="address in mailboxOptions" :key="address" :value="address">
                  {{ address }}
                </option>
              </optgroup>
              <option v-if="canPickCustom" :value="CUSTOM_FROM">Address on my domain…</option>
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
                aria-label="Sender address local part"
                list="draft-from-aliases"
                class="min-w-0 flex-1 bg-transparent px-2 py-1.5 text-xs text-ctp-text placeholder:text-ctp-subtext0 focus:outline-none"
              />
              <!-- Suggestions are scoped to the chosen domain — the account-wide alias
                   list is far too long to offer whole. -->
              <datalist id="draft-from-aliases">
                <option v-for="alias in aliasSuggestions" :key="alias" :value="alias" />
              </datalist>
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

          <div class="mt-1.5 flex items-center gap-2">
            <button
              type="button"
              :disabled="!editedAddress"
              class="rounded border border-ctp-mauve/50 px-2 py-1 text-xs font-medium text-ctp-mauve hover:bg-ctp-mauve/10 disabled:opacity-50"
              @click="applyFrom"
            >
              Use this address
            </button>
            <button
              type="button"
              class="rounded px-2 py-1 text-xs text-ctp-subtext0 hover:text-ctp-text"
              @click="cancelEditingFrom"
            >
              Cancel
            </button>
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

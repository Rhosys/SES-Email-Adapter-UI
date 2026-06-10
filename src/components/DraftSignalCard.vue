<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { marked } from 'marked'
import { useAccountStore } from '@/stores/account'
import { api } from '@/lib/api'
import { useToast } from '@/composables/useToast'
import type { Signal, Domain } from '@/types/server'
import { isEmailSignal } from '@/lib/signal-guards'
import AsyncButton from '@/components/ui/AsyncButton.vue'

const props = defineProps<{ signal: Signal }>()
const emit = defineEmits<{ discard: []; sent: [] }>()

const accountStore = useAccountStore()
const { deferAction, undo: undoToast } = useToast()

// Parse existing from address (empty for brand-new drafts)
function splitAddress(address: string): [string, string] {
  const at = address.indexOf('@')
  return at >= 0 ? [address.slice(0, at), address.slice(at + 1)] : ['', '']
}

const emailData = isEmailSignal(props.signal) ? props.signal.data : null
const [initLocal, initDomain] = splitAddress(emailData?.from?.address ?? '')
const localPart = ref(initLocal)
const selectedDomain = ref(initDomain)
const subject = ref(emailData?.subject ?? '')
const body = ref(emailData?.body ?? '')

const expanded = ref(true)
const showPreview = ref(false)
const domains = ref<Domain[]>([])
const domainsLoaded = ref(false)
const saving = ref(false)
const sendState = ref<'idle' | 'sending' | 'cancellable'>('idle')
const toastId = ref<string | null>(null)
const error = ref<string | null>(null)

const verifiedDomains = computed(() => domains.value.filter((d) => d.senderSetupComplete))

const fromAddress = computed(() =>
  localPart.value && selectedDomain.value ? `${localPart.value}@${selectedDomain.value}` : '',
)

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
  const result = await api.listDomains(accountStore.accountId)
  if (result.isOk()) {
    domains.value = result.value
    if (!selectedDomain.value && verifiedDomains.value.length > 0) {
      selectedDomain.value = verifiedDomains.value[0].domain
    }
  }
  domainsLoaded.value = true
})

let saveTimer: ReturnType<typeof setTimeout> | null = null

watch([localPart, selectedDomain, subject, body], () => {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => void persistDraft(), 900)
})

async function persistDraft() {
  if (!accountStore.accountId) return
  saving.value = true
  const result = await api.updateDraftSignal(accountStore.accountId, props.signal.signalId, {
    from: fromAddress.value ? { address: fromAddress.value } : undefined,
    subject: subject.value,
    textBody: body.value,
  })
  saving.value = false
  if (result.isErr()) error.value = result.error.message
}

async function send() {
  if (!accountStore.accountId || !canSend.value) return
  error.value = null
  await persistDraft()

  const accountId = accountStore.accountId
  const signalId = props.signal.signalId

  sendState.value = 'sending'
  const result = await api.sendSignal(accountId, signalId)
  if (result.isErr()) {
    sendState.value = 'idle'
    error.value = result.error.message
    return
  }

  sendState.value = 'cancellable'

  const id = deferAction(
    'Email sent',
    async () => {
      // Toast expired — signal is now live. Parent re-fetches to show EmailSignalCard with undo button.
      sendState.value = 'idle'
      toastId.value = null
      emit('sent')
    },
    30_000,
    {
      submessage: `To: ${toLabel.value}`,
      undoLabel: 'Cancel send',
      onUndo: async () => {
        const cancelResult = await api.patchSignal(accountId, signalId, { status: 'draft' })
        sendState.value = 'idle'
        toastId.value = null
        if (cancelResult.isOk()) {
          emit('discard')
        } else {
          error.value = 'Email already delivered — cancel was too late'
          emit('sent')
        }
      },
    },
  )
  toastId.value = id
}

function cancelSend() {
  if (toastId.value) undoToast(toastId.value)
}

async function discard() {
  if (!accountStore.accountId) return
  await api.deleteDraftSignal(accountStore.accountId, props.signal.signalId)
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
          {{ fromAddress || 'No sender selected' }} → {{ toLabel }}
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

      <!-- From: local-part @ domain -->
      <div v-if="domainsLoaded" class="mb-2">
        <template v-if="verifiedDomains.length === 0">
          <div
            class="rounded border border-ctp-yellow/40 bg-ctp-yellow/10 px-3 py-2 text-xs text-ctp-yellow"
          >
            <span class="font-medium">No verified sending domain.</span>
            You need at least one verified domain before you can send replies.
            <router-link to="/settings" class="underline hover:text-ctp-text">
              Add one in Settings → Domains.
            </router-link>
          </div>
        </template>
        <template v-else>
          <label for="draft-from-local" class="mb-1 block text-xs text-ctp-subtext0">From</label>
          <div
            class="flex items-center rounded border border-ctp-surface1 bg-ctp-base focus-within:border-ctp-mauve"
          >
            <input
              id="draft-from-local"
              v-model="localPart"
              type="text"
              placeholder="you"
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

      <!-- Actions -->
      <div class="flex items-center gap-3">
        <template v-if="sendState === 'cancellable'">
          <span class="text-sm text-ctp-subtext0">Sent — cancellable via toast…</span>
          <button class="text-sm text-ctp-red hover:opacity-80" @click="cancelSend">
            Cancel send
          </button>
        </template>
        <template v-else>
          <button
            :disabled="!canSend"
            class="rounded bg-ctp-mauve px-4 py-1.5 text-sm font-medium text-ctp-base hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            @click="send"
          >
            {{ sendState === 'sending' ? 'Sending…' : 'Send' }}
          </button>
          <AsyncButton
            :action="discard"
            variant="ghost"
            class="text-sm text-ctp-subtext0 hover:text-ctp-red"
          >
            Discard draft
          </AsyncButton>
        </template>
      </div>
    </div>
  </div>
</template>

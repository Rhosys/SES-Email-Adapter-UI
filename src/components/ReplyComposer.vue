<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useAccountStore } from '@/stores/account'
import { api } from '@/lib/api'
import type { Signal, Domain } from '@/types/server'

const props = defineProps<{ signal: Signal }>()

const accountStore = useAccountStore()

const localPart = ref('')
const selectedDomain = ref('')
const body = ref('')
const domains = ref<Domain[]>([])
const domainsLoaded = ref(false)
const draftId = ref<string | null>(null)
const sending = ref(false)
const error = ref<string | null>(null)

const fromAddress = computed(() =>
  localPart.value && selectedDomain.value ? `${localPart.value}@${selectedDomain.value}` : '',
)
const replySubject = computed(() => `Re: ${props.signal.subject}`)

const verifiedDomains = computed(() => domains.value.filter((d) => d.status === 'verified'))

const canSend = computed(
  () => !!fromAddress.value && body.value.trim().length > 0 && !sending.value,
)

onMounted(async () => {
  if (!accountStore.accountId) return
  const result = await api.listDomains(accountStore.accountId)
  if (result.isOk()) {
    domains.value = result.value
    if (verifiedDomains.value.length > 0) {
      selectedDomain.value = verifiedDomains.value[0].domain
    }
  }
  domainsLoaded.value = true
})

onUnmounted(() => {
  if (draftId.value && accountStore.accountId) {
    // fire-and-forget cleanup
    void api.deleteDraftSignal(accountStore.accountId, draftId.value)
  }
})

let draftDebounce: ReturnType<typeof setTimeout> | null = null

watch(body, () => {
  if (!body.value.trim()) return
  if (draftDebounce) clearTimeout(draftDebounce)
  draftDebounce = setTimeout(() => void persistDraft(), 800)
})

watch([localPart, selectedDomain], () => {
  if (!draftId.value) return
  if (draftDebounce) clearTimeout(draftDebounce)
  draftDebounce = setTimeout(() => void persistDraft(), 800)
})

async function persistDraft() {
  if (!accountStore.accountId) return
  if (!draftId.value) {
    const result = await api.createDraftSignal(accountStore.accountId, {
      status: 'draft',
      source: 'user',
      from: { address: fromAddress.value || `reply@${selectedDomain.value}` },
      to: [{ address: props.signal.from.address }],
      subject: replySubject.value,
      textBody: body.value,
      arcId: props.signal.arcId,
    })
    if (result.isOk()) {
      draftId.value = result.value.id
    } else {
      error.value = result.error.message
    }
  } else {
    const result = await api.updateDraftSignal(accountStore.accountId, draftId.value, {
      from: fromAddress.value ? { address: fromAddress.value } : undefined,
      textBody: body.value,
    })
    if (result.isErr()) {
      error.value = result.error.message
    }
  }
}

async function send() {
  if (!accountStore.accountId || !canSend.value) return
  sending.value = true
  error.value = null

  // Ensure draft is created/up-to-date before sending
  await persistDraft()

  if (!draftId.value) {
    sending.value = false
    return
  }

  const result = await api.sendSignal(accountStore.accountId, draftId.value)
  sending.value = false
  if (result.isErr()) {
    error.value = result.error.message
  } else {
    body.value = ''
    localPart.value = ''
    draftId.value = null
  }
}

async function discard() {
  if (draftId.value && accountStore.accountId) {
    await api.deleteDraftSignal(accountStore.accountId, draftId.value)
  }
  body.value = ''
  localPart.value = ''
  draftId.value = null
  error.value = null
}
</script>

<template>
  <div class="rounded-lg border border-ctp-surface1 bg-ctp-mantle p-4">
    <h3 class="mb-3 text-sm font-medium text-ctp-text">Reply</h3>

    <!-- Error -->
    <div
      v-if="error"
      class="mb-3 rounded border border-ctp-red bg-ctp-red/10 px-3 py-2 text-xs text-ctp-red"
    >
      {{ error }}
      <button class="ml-1 underline" @click="error = null">Dismiss</button>
    </div>

    <!-- To -->
    <div class="mb-2 text-xs text-ctp-subtext0">
      <span class="font-medium">To:</span> {{ signal.from.address }}
    </div>

    <!-- From — no verified domains -->
    <div v-if="domainsLoaded && verifiedDomains.length === 0" class="mb-3">
      <div
        class="rounded border border-ctp-yellow/40 bg-ctp-yellow/10 px-3 py-2 text-xs text-ctp-yellow"
      >
        No verified sending domains.
        <router-link to="/settings" class="underline hover:text-ctp-text">
          Set one up in Settings → Domains
        </router-link>
        before you can reply.
      </div>
    </div>

    <!-- From field: local-part + domain selector -->
    <div v-else-if="domainsLoaded" class="mb-3">
      <label class="mb-1 block text-xs text-ctp-subtext0">From</label>
      <div
        class="flex items-center rounded border border-ctp-surface1 bg-ctp-base focus-within:border-ctp-mauve"
      >
        <input
          v-model="localPart"
          type="text"
          placeholder="you"
          class="min-w-0 flex-1 bg-transparent px-2 py-1.5 text-xs text-ctp-text placeholder:text-ctp-subtext0 focus:outline-none"
        />
        <span class="shrink-0 text-xs text-ctp-subtext0">@</span>
        <select
          v-model="selectedDomain"
          class="shrink-0 bg-transparent py-1.5 pr-2 text-xs text-ctp-text focus:outline-none"
        >
          <option v-for="d in verifiedDomains" :key="d.id" :value="d.domain">
            {{ d.domain }}
          </option>
        </select>
      </div>
    </div>

    <!-- Subject -->
    <div class="mb-3 text-xs text-ctp-subtext0">
      <span class="font-medium">Subject:</span> {{ replySubject }}
    </div>

    <!-- Body -->
    <textarea
      v-model="body"
      rows="6"
      placeholder="Write your reply…"
      :disabled="domainsLoaded && verifiedDomains.length === 0"
      class="w-full rounded border border-ctp-surface1 bg-ctp-base px-3 py-2 text-sm text-ctp-text placeholder:text-ctp-subtext0 focus:border-ctp-mauve focus:outline-none disabled:opacity-50"
    />

    <!-- Draft saved indicator -->
    <div v-if="draftId" class="mb-2 text-xs text-ctp-subtext0">Draft saved</div>

    <!-- Actions -->
    <div class="mt-3 flex items-center gap-3">
      <button
        :disabled="!canSend"
        class="rounded bg-ctp-mauve px-4 py-1.5 text-sm font-medium text-ctp-base hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        @click="send"
      >
        {{ sending ? 'Sending…' : 'Send' }}
      </button>
      <button
        v-if="body || draftId"
        class="text-sm text-ctp-subtext0 hover:text-ctp-text"
        @click="discard"
      >
        Discard
      </button>
    </div>
  </div>
</template>

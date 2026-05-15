<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAccountStore } from '@/stores/account'
import { api } from '@/lib/api'
import type { SenderFilterMode } from '@/types/server'

const router = useRouter()
const accountStore = useAccountStore()

const step = ref(1)
const TOTAL_STEPS = 6
const STEP_LABELS = ['Account', 'Domain', 'Test email', 'Sender', 'Filter mode', 'Done']

// Step 1 – Account creation
const accountName = ref('')
const accountCreating = ref(false)
const accountCreated = ref(false)
const accountError = ref('')

async function submitAccount() {
  if (!accountName.value.trim()) return
  accountCreating.value = true
  accountError.value = ''
  const ok = await accountStore.createAccount(accountName.value.trim())
  accountCreating.value = false
  if (!ok) {
    accountError.value = accountStore.error ?? 'Failed to create account'
    return
  }
  accountCreated.value = true
}

// Step 2 – Domain
const domain = ref('')
const addingDomain = ref(false)
const domainAdded = ref(false)
const domainError = ref('')
const dnsRecords = ref<{ type: string; host: string; value: string }[]>([])

async function submitDomain() {
  if (!accountStore.accountId || !domain.value.trim()) return
  addingDomain.value = true
  domainError.value = ''
  const result = await api.addDomain(accountStore.accountId, { domain: domain.value.trim() })
  addingDomain.value = false
  if (result.isErr()) {
    domainError.value = result.error.message
    return
  }
  dnsRecords.value = result.value.dnsRecords
  domainAdded.value = true
}

// Step 3 – Test email
const testEmailSent = ref(false)
const signalArrived = ref(false)
let pollInterval: ReturnType<typeof setInterval> | null = null

function startPolling() {
  testEmailSent.value = true
  if (!accountStore.accountId) return
  let attempts = 0
  pollInterval = setInterval(async () => {
    attempts++
    if (attempts > 30) {
      clearInterval(pollInterval!)
      return
    }
    const result = await api.listQuarantinedSignals(accountStore.accountId!, 'quarantine_visible', {
      limit: 1,
    })
    if (result.isOk() && result.value.items.length > 0) {
      signalArrived.value = true
      clearInterval(pollInterval!)
    }
  }, 3000)
}

onUnmounted(() => {
  if (pollInterval) clearInterval(pollInterval)
})

// Step 4 – Sender address
const senderAddress = ref('')
const senderPending = ref(false)
const senderDone = ref(false)

async function saveSender() {
  if (!accountStore.accountId || !senderAddress.value.trim()) return
  senderPending.value = true
  const result = await api.createAlias(accountStore.accountId, {
    address: senderAddress.value.trim(),
  })
  senderPending.value = false
  if (result.isOk()) senderDone.value = true
}

// Step 5 – Filter mode
const filterMode = ref<SenderFilterMode>('notify_new')

const FILTER_OPTIONS: {
  value: SenderFilterMode
  label: string
  description: string
  recommended?: boolean
}[] = [
  {
    value: 'allow_all',
    label: 'Allow all',
    description: 'All senders get through. No filtering.',
  },
  {
    value: 'notify_new',
    label: 'Notify new senders',
    description: 'First email from an unknown sender goes to quarantine once.',
    recommended: true,
  },
  {
    value: 'sender_match',
    label: 'Sender match',
    description: 'Only senders on your approved list get through.',
  },
  {
    value: 'strict',
    label: 'Strict',
    description: 'Approved senders only; all others are blocked.',
  },
]

// Navigation
async function next() {
  if (step.value === 5 && senderDone.value) {
    await api.updateAlias(accountStore.accountId!, senderAddress.value.trim(), {
      filterMode: filterMode.value,
    })
  }
  if (step.value < TOTAL_STEPS) step.value++
}

function prev() {
  if (step.value > 1) step.value--
}

function finish() {
  void router.push('/')
}

const canProceed = computed(() => {
  if (step.value === 1) return accountCreated.value
  if (step.value === 2) return domainAdded.value
  if (step.value === 3) return signalArrived.value || testEmailSent.value
  if (step.value === 4) return senderDone.value || senderAddress.value.trim().length > 0
  return true
})

onMounted(async () => {
  if (!accountStore.fetched) await accountStore.fetchAccount()
  if (accountStore.accountId) {
    accountCreated.value = true
    step.value = 2
  }
})
</script>

<template>
  <div class="flex min-h-screen flex-col bg-ctp-base text-ctp-text">
    <!-- Progress header -->
    <header class="border-b border-ctp-surface0 bg-ctp-mantle px-6 py-4">
      <div class="mx-auto max-w-2xl">
        <div class="mb-3 flex items-center justify-between">
          <span class="text-sm font-semibold">Setup</span>
          <span class="text-xs text-ctp-subtext0">Step {{ step }} of {{ TOTAL_STEPS }}</span>
        </div>
        <div class="flex gap-1">
          <div
            v-for="i in TOTAL_STEPS"
            :key="i"
            class="h-1.5 flex-1 rounded-full transition-colors"
            :class="i <= step ? 'bg-ctp-mauve' : 'bg-ctp-surface1'"
          />
        </div>
        <div class="mt-2 flex">
          <span
            v-for="(label, i) in STEP_LABELS"
            :key="i"
            class="flex-1 text-center text-xs"
            :class="i + 1 === step ? 'font-medium text-ctp-mauve' : 'text-ctp-subtext0'"
            >{{ label }}</span
          >
        </div>
      </div>
    </header>

    <main class="mx-auto w-full max-w-2xl flex-1 px-6 py-10">
      <!-- ── Step 1: Account ────────────────────────────────────────────────── -->
      <section v-if="step === 1">
        <h2 class="mb-1 text-xl font-semibold">Create your account</h2>
        <p class="mb-6 text-sm text-ctp-subtext0">
          Give your organisation a name. You can change this later in Settings.
        </p>

        <div
          v-if="accountError"
          class="mb-4 rounded border border-ctp-red bg-ctp-red/10 px-3 py-2 text-xs text-ctp-red"
        >
          {{ accountError }}
        </div>

        <form class="flex flex-wrap gap-2" @submit.prevent="submitAccount">
          <input
            v-model="accountName"
            type="text"
            placeholder="Acme Corp"
            :disabled="accountCreated"
            class="min-w-0 flex-1 rounded-lg border border-ctp-surface1 bg-ctp-mantle px-4 py-2.5 text-sm text-ctp-text placeholder:text-ctp-subtext0 focus:border-ctp-mauve focus:outline-none disabled:opacity-50"
          />
          <button
            type="submit"
            :disabled="accountCreating || accountCreated || !accountName.trim()"
            class="shrink-0 rounded-lg bg-ctp-mauve px-5 py-2.5 text-sm font-medium text-ctp-base hover:opacity-90 disabled:opacity-50"
          >
            {{ accountCreating ? 'Creating…' : accountCreated ? 'Created ✓' : 'Create account' }}
          </button>
        </form>
      </section>

      <!-- ── Step 2: Domain ─────────────────────────────────────────────────── -->
      <section v-else-if="step === 2">
        <h2 class="mb-1 text-xl font-semibold">Add your sending domain</h2>
        <p class="mb-6 text-sm text-ctp-subtext0">
          Enter the domain you'll receive emails at. We'll give you DNS records to configure.
        </p>

        <div
          v-if="domainError"
          class="mb-4 rounded border border-ctp-red bg-ctp-red/10 px-3 py-2 text-xs text-ctp-red"
        >
          {{ domainError }}
        </div>

        <form class="flex flex-wrap gap-2" @submit.prevent="submitDomain">
          <input
            v-model="domain"
            type="text"
            placeholder="yourdomain.com"
            :disabled="domainAdded"
            class="min-w-0 flex-1 rounded-lg border border-ctp-surface1 bg-ctp-mantle px-4 py-2.5 text-sm text-ctp-text placeholder:text-ctp-subtext0 focus:border-ctp-mauve focus:outline-none disabled:opacity-50"
          />
          <button
            type="submit"
            :disabled="addingDomain || domainAdded || !domain.trim()"
            class="shrink-0 rounded-lg bg-ctp-mauve px-5 py-2.5 text-sm font-medium text-ctp-base hover:opacity-90 disabled:opacity-50"
          >
            {{ addingDomain ? 'Adding…' : domainAdded ? 'Added ✓' : 'Add domain' }}
          </button>
        </form>

        <div v-if="dnsRecords.length" class="mt-6 space-y-2">
          <p class="text-sm font-medium text-ctp-subtext1">Add these DNS records to your domain:</p>
          <div
            v-for="(rec, i) in dnsRecords"
            :key="i"
            class="rounded-lg border border-ctp-surface1 p-3"
          >
            <div class="mb-1 flex items-center gap-2">
              <span
                class="rounded bg-ctp-surface1 px-1.5 py-0.5 font-mono text-xs text-ctp-subtext0"
                >{{ rec.type }}</span
              >
              <span class="font-mono text-xs text-ctp-text">{{ rec.host }}</span>
            </div>
            <p class="break-all font-mono text-xs text-ctp-subtext0">{{ rec.value }}</p>
          </div>
          <p class="text-xs text-ctp-subtext0">
            DNS changes can take up to 48 hours to propagate. You can continue setup while they
            verify.
          </p>
        </div>
      </section>

      <!-- ── Step 3: Test email ─────────────────────────────────────────────── -->
      <section v-else-if="step === 3">
        <h2 class="mb-1 text-xl font-semibold">Send a test email</h2>
        <p class="mb-6 text-sm text-ctp-subtext0">
          Send any email to an address at your domain. We'll detect it here in real time.
        </p>

        <div
          v-if="!testEmailSent"
          class="rounded-lg border border-dashed border-ctp-surface1 py-10 text-center"
        >
          <p class="mb-4 text-sm text-ctp-subtext0">
            Send to:
            <span class="font-mono text-ctp-text">inbox@{{ domain || 'yourdomain.com' }}</span>
          </p>
          <button
            class="rounded-lg bg-ctp-mauve px-5 py-2.5 text-sm font-medium text-ctp-base hover:opacity-90"
            @click="startPolling"
          >
            I've sent it — start watching
          </button>
        </div>

        <div v-else class="rounded-lg border border-ctp-surface1 p-6 text-center">
          <div v-if="signalArrived" class="text-ctp-green">
            <p class="text-2xl">✓</p>
            <p class="mt-2 text-sm font-medium">Email received!</p>
            <p class="mt-1 text-xs text-ctp-subtext0">
              Your domain is connected and processing emails.
            </p>
          </div>
          <div v-else>
            <div
              class="mx-auto mb-3 h-6 w-6 animate-spin rounded-full border-2 border-ctp-surface1 border-t-ctp-mauve"
            />
            <p class="text-sm text-ctp-subtext0">Waiting for your email…</p>
            <p class="mt-1 text-xs text-ctp-subtext0">Checking every 3 seconds</p>
          </div>
        </div>

        <p class="mt-4 text-xs text-ctp-subtext0">
          You can skip this step and send the test email later.
        </p>
      </section>

      <!-- ── Step 4: Sender address ─────────────────────────────────────────── -->
      <section v-else-if="step === 4">
        <h2 class="mb-1 text-xl font-semibold">Set your sender address</h2>
        <p class="mb-6 text-sm text-ctp-subtext0">
          Choose the email address that will appear in the "From" field for outgoing emails.
        </p>

        <form class="flex flex-wrap gap-2" @submit.prevent="saveSender">
          <input
            v-model="senderAddress"
            type="email"
            placeholder="you@yourdomain.com"
            :disabled="senderDone"
            class="min-w-0 flex-1 rounded-lg border border-ctp-surface1 bg-ctp-mantle px-4 py-2.5 text-sm text-ctp-text placeholder:text-ctp-subtext0 focus:border-ctp-mauve focus:outline-none disabled:opacity-50"
          />
          <button
            type="submit"
            :disabled="senderPending || senderDone || !senderAddress.trim()"
            class="shrink-0 rounded-lg bg-ctp-mauve px-5 py-2.5 text-sm font-medium text-ctp-base hover:opacity-90 disabled:opacity-50"
          >
            {{ senderPending ? 'Saving…' : senderDone ? 'Saved ✓' : 'Save' }}
          </button>
        </form>
      </section>

      <!-- ── Step 5: Filter mode ────────────────────────────────────────────── -->
      <section v-else-if="step === 5">
        <h2 class="mb-1 text-xl font-semibold">Choose your default filter mode</h2>
        <p class="mb-6 text-sm text-ctp-subtext0">
          This controls how new unknown senders are handled by default.
        </p>

        <div class="space-y-2">
          <button
            v-for="opt in FILTER_OPTIONS"
            :key="opt.value"
            class="w-full rounded-lg border px-4 py-3 text-left transition-colors"
            :class="
              filterMode === opt.value
                ? 'border-ctp-mauve bg-ctp-mauve/10'
                : 'border-ctp-surface1 hover:border-ctp-surface2'
            "
            @click="filterMode = opt.value"
          >
            <div class="flex items-center justify-between">
              <span class="text-sm font-medium text-ctp-text">{{ opt.label }}</span>
              <span
                v-if="opt.recommended"
                class="rounded-full bg-ctp-mauve/20 px-2 py-0.5 text-xs text-ctp-mauve"
              >
                Recommended
              </span>
            </div>
            <p class="mt-0.5 text-xs text-ctp-subtext0">{{ opt.description }}</p>
          </button>
        </div>
      </section>

      <!-- ── Step 6: Done ───────────────────────────────────────────────────── -->
      <section v-else-if="step === 6" class="text-center">
        <p class="mb-3 text-4xl">🎉</p>
        <h2 class="mb-1 text-xl font-semibold">You're all set!</h2>
        <p class="mb-6 text-sm text-ctp-subtext0">
          Your email adapter is configured and ready to process incoming emails.
        </p>

        <div class="mb-6 space-y-2 rounded-lg border border-ctp-surface1 p-4 text-left text-sm">
          <div class="flex items-center gap-2">
            <span class="text-ctp-green">✓</span>
            <span class="text-ctp-subtext1"
              >Account:
              <strong class="text-ctp-text">{{ accountStore.account?.name }}</strong></span
            >
          </div>
          <div class="flex items-center gap-2">
            <span class="text-ctp-green">✓</span>
            <span class="text-ctp-subtext1"
              >Domain: <strong class="text-ctp-text">{{ domain || '(skipped)' }}</strong></span
            >
          </div>
          <div class="flex items-center gap-2">
            <span :class="signalArrived ? 'text-ctp-green' : 'text-ctp-subtext0'">
              {{ signalArrived ? '✓' : '○' }}
            </span>
            <span class="text-ctp-subtext1"
              >Test email {{ signalArrived ? 'received' : '(skipped)' }}</span
            >
          </div>
          <div class="flex items-center gap-2">
            <span :class="senderDone ? 'text-ctp-green' : 'text-ctp-subtext0'">
              {{ senderDone ? '✓' : '○' }}
            </span>
            <span class="text-ctp-subtext1"
              >Sender address {{ senderDone ? 'configured' : '(skipped)' }}</span
            >
          </div>
          <div class="flex items-center gap-2">
            <span class="text-ctp-green">✓</span>
            <span class="text-ctp-subtext1"
              >Filter mode: <strong class="text-ctp-text">{{ filterMode }}</strong></span
            >
          </div>
        </div>

        <button
          class="rounded-lg bg-ctp-mauve px-6 py-2.5 text-sm font-medium text-ctp-base hover:opacity-90"
          @click="finish"
        >
          Go to inbox →
        </button>
      </section>
    </main>

    <!-- Navigation footer -->
    <footer class="border-t border-ctp-surface0 bg-ctp-mantle px-6 py-4">
      <div class="mx-auto flex max-w-2xl items-center justify-between">
        <button v-if="step > 1" class="text-sm text-ctp-subtext0 hover:text-ctp-text" @click="prev">
          ← Back
        </button>
        <span v-else />

        <div class="flex items-center gap-3">
          <button
            v-if="step < TOTAL_STEPS"
            class="text-sm text-ctp-subtext0 hover:text-ctp-text"
            @click="next"
          >
            Skip
          </button>
          <button
            v-if="step < TOTAL_STEPS"
            :disabled="!canProceed"
            class="rounded-lg bg-ctp-mauve px-5 py-2 text-sm font-medium text-ctp-base hover:opacity-90 disabled:opacity-50"
            @click="next"
          >
            Continue →
          </button>
          <button
            v-else
            class="rounded-lg bg-ctp-mauve px-5 py-2 text-sm font-medium text-ctp-base hover:opacity-90"
            @click="finish"
          >
            Finish →
          </button>
        </div>
      </div>
    </footer>
  </div>
</template>

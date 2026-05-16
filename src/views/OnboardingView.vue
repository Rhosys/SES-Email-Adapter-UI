<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAccountStore } from '@/stores/account'
import { api } from '@/lib/api'
import UserAvatar from '@/components/UserAvatar.vue'

const router = useRouter()
const accountStore = useAccountStore()

const step = ref(1)
const TOTAL_STEPS = 4
const STEP_LABELS = ['Domain', 'Test email', 'Sender', 'Done']

// Step 1 – Domain
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
  await persistProgress({ domainAdded: true })
}

// Step 2 – Test email
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
      await persistProgress({ testEmailReceived: true })
    }
  }, 3000)
}

onUnmounted(() => {
  if (pollInterval) clearInterval(pollInterval)
})

// Step 3 – Sender address
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
  if (result.isOk()) {
    senderDone.value = true
    await persistProgress({ senderConfigured: true })
  }
}

// Persist onboarding progress to the account
async function persistProgress(patch: Partial<{
  domainAdded: boolean
  testEmailReceived: boolean
  senderConfigured: boolean
  filterModeSet: boolean
  completed: boolean
}>) {
  if (!accountStore.accountId) return
  const result = await api.updateAccount(accountStore.accountId, { onboarding: patch })
  if (result.isOk()) {
    // Keep local account store in sync
    accountStore.account = result.value
  }
}

// Navigation
function next() {
  if (step.value < TOTAL_STEPS) step.value++
}

function prev() {
  if (step.value > 1) step.value--
}

async function finish() {
  await persistProgress({ completed: true })
  void router.push('/')
}

// Whether the current step's primary action has been completed
const stepDone = computed(() => {
  if (step.value === 1) return domainAdded.value
  if (step.value === 2) return signalArrived.value
  if (step.value === 3) return senderDone.value
  return true // step 4 = Done, no action required
})

onMounted(async () => {
  if (!accountStore.fetched) await accountStore.fetchAccount()

  // Auto-create account if none exists; name can be set later in Settings
  if (!accountStore.accountId) {
    await accountStore.createAccount('')
  }

  // Restore progress from the account's onboarding state so the user can
  // resume where they left off if they close the tab mid-flow
  const ob = accountStore.account?.onboarding
  if (ob) {
    if (ob.domainAdded) domainAdded.value = true
    if (ob.testEmailReceived) signalArrived.value = true
    if (ob.senderConfigured) senderDone.value = true

    // Jump to the furthest incomplete step
    if (!ob.domainAdded) step.value = 1
    else if (!ob.testEmailReceived) step.value = 2
    else if (!ob.senderConfigured) step.value = 3
    else step.value = 4
  }
})
</script>

<template>
  <div class="flex min-h-screen flex-col bg-ctp-base text-ctp-text">
    <!-- Top nav bar: logo + profile -->
    <div class="flex items-center justify-between border-b border-ctp-surface0 bg-ctp-mantle px-6 py-3">
      <span class="text-sm font-semibold text-ctp-text">SES Adapter</span>
      <UserAvatar />
    </div>

    <!-- Progress header -->
    <header class="border-b border-ctp-surface0 bg-ctp-mantle px-6 py-3">
      <div class="mx-auto max-w-2xl">
        <div class="mb-2 flex items-center justify-between">
          <span class="text-xs font-medium text-ctp-subtext0">Setup</span>
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
      <!-- ── Step 1: Domain ─────────────────────────────────────────────────── -->
      <section v-if="step === 1">
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
              <span class="rounded bg-ctp-surface1 px-1.5 py-0.5 font-mono text-xs text-ctp-subtext0">{{ rec.type }}</span>
              <span class="font-mono text-xs text-ctp-text">{{ rec.host }}</span>
            </div>
            <p class="break-all font-mono text-xs text-ctp-subtext0">{{ rec.value }}</p>
          </div>
          <p class="text-xs text-ctp-subtext0">
            DNS changes can take up to 48 hours to propagate. You can continue setup while they verify.
          </p>
        </div>
      </section>

      <!-- ── Step 2: Test email ─────────────────────────────────────────────── -->
      <section v-else-if="step === 2">
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
            <p class="mt-1 text-xs text-ctp-subtext0">Your domain is connected and processing emails.</p>
          </div>
          <div v-else>
            <div class="mx-auto mb-3 h-6 w-6 animate-spin rounded-full border-2 border-ctp-surface1 border-t-ctp-mauve" />
            <p class="text-sm text-ctp-subtext0">Waiting for your email…</p>
            <p class="mt-1 text-xs text-ctp-subtext0">Checking every 3 seconds</p>
          </div>
        </div>
      </section>

      <!-- ── Step 3: Sender address ─────────────────────────────────────────── -->
      <section v-else-if="step === 3">
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

      <!-- ── Step 4: Done ───────────────────────────────────────────────────── -->
      <section v-else-if="step === 4" class="text-center">
        <p class="mb-3 text-4xl">🎉</p>
        <h2 class="mb-1 text-xl font-semibold">You're all set!</h2>
        <p class="mb-6 text-sm text-ctp-subtext0">
          Your email adapter is configured and ready to process incoming emails.
        </p>

        <div class="mb-6 space-y-2 rounded-lg border border-ctp-surface1 p-4 text-left text-sm">
          <div class="flex items-center gap-2">
            <span :class="domainAdded ? 'text-ctp-green' : 'text-ctp-subtext0'">
              {{ domainAdded ? '✓' : '○' }}
            </span>
            <span class="text-ctp-subtext1"
              >Domain: <strong class="text-ctp-text">{{ domain || '(skipped)' }}</strong></span
            >
          </div>
          <div class="flex items-center gap-2">
            <span :class="signalArrived ? 'text-ctp-green' : 'text-ctp-subtext0'">
              {{ signalArrived ? '✓' : '○' }}
            </span>
            <span class="text-ctp-subtext1">Test email {{ signalArrived ? 'received' : '(skipped)' }}</span>
          </div>
          <div class="flex items-center gap-2">
            <span :class="senderDone ? 'text-ctp-green' : 'text-ctp-subtext0'">
              {{ senderDone ? '✓' : '○' }}
            </span>
            <span class="text-ctp-subtext1">Sender address {{ senderDone ? 'configured' : '(skipped)' }}</span>
          </div>
        </div>

        <button
          class="rounded-lg bg-ctp-mauve px-6 py-3 text-sm font-medium text-ctp-base hover:opacity-90"
          @click="finish"
        >
          Go to inbox →
        </button>
      </section>

      <!-- ── Navigation ─────────────────────────────────────────────────────── -->
      <!--
        Steps 1–3: show Skip until the step action is done, then Continue.
        This ensures Continue never appears alongside an in-step action button.
      -->
      <div v-if="step < TOTAL_STEPS" class="mt-10 flex items-center justify-between">
        <button
          v-if="step > 1"
          class="text-sm text-ctp-subtext0 hover:text-ctp-text"
          @click="prev"
        >
          ← Back
        </button>
        <span v-else />

        <button
          v-if="!stepDone"
          class="text-sm text-ctp-subtext0 hover:text-ctp-text"
          @click="next"
        >
          Skip
        </button>
        <button
          v-else
          class="rounded-lg bg-ctp-mauve px-6 py-3 text-sm font-medium text-ctp-base hover:opacity-90"
          @click="next"
        >
          Continue →
        </button>
      </div>
    </main>
  </div>
</template>

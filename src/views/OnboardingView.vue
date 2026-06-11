<script setup lang="ts">
import { ref, computed, watch, watchEffect, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAccountStore } from '@/stores/account'
import { api } from '@/lib/api'
import logger from '@/lib/logger'
import type { DnsRecord } from '@/types/server'
import CopyInput from '@/components/CopyInput.vue'
import AppNavbar from '@/components/AppNavbar.vue'
import AsyncButton from '@/components/ui/AsyncButton.vue'

const router = useRouter()
const accountStore = useAccountStore()

// ── Deterministic test email username from domain hash ────────────────────────
const WORDS = [
  'acorn', 'amber', 'atlas', 'azure', 'birch', 'blaze', 'bloom', 'cedar',
  'chess', 'cider', 'cloak', 'cloud', 'coral', 'crane', 'crisp', 'daisy',
  'delta', 'drake', 'drift', 'ember', 'fable', 'finch', 'flare', 'flask',
  'flora', 'flute', 'forge', 'frost', 'gavel', 'gleam', 'globe', 'grace',
  'grain', 'grove', 'haven', 'hazel', 'heron', 'holly', 'ivory', 'jewel',
  'kayak', 'label', 'lance', 'lemon', 'lodge', 'lumen', 'maple', 'march',
  'merit', 'mocha', 'noble', 'nomad', 'north', 'oasis', 'ocean', 'olive',
  'orbit', 'otter', 'panda', 'panel', 'pearl', 'perch', 'piano', 'pilot',
  'pixel', 'plain', 'plume', 'polar', 'poppy', 'prism', 'prose', 'pulse',
  'raven', 'realm', 'ridge', 'rival', 'river', 'robin', 'rocky', 'rouge',
  'royal', 'ruler', 'saint', 'scout', 'shade', 'shark', 'shell', 'shine',
  'shore', 'sigma', 'silky', 'siren', 'slate', 'slick', 'smart', 'solar',
  'sonic', 'south', 'spark', 'spell', 'spire', 'stone', 'storm', 'story',
  'straw', 'sugar', 'surge', 'swift', 'swirl', 'synth', 'talon', 'tempo',
  'tenor', 'theta', 'tiger', 'topaz', 'torch', 'totem', 'tower', 'trade',
  'trail', 'train', 'trout', 'trove', 'ultra', 'union', 'vigor', 'viola',
  'vista', 'vital', 'vivid', 'vogue', 'voice', 'vault', 'waltz', 'water',
  'weave', 'whale', 'wheat', 'wheel', 'white', 'world', 'wrath', 'yacht',
  'yield', 'young', 'zesty', 'zippy',
]
const testEmailUser = ref('test.numaeel')

import { isValidDomain } from '@/lib/validation'

// ── Steps ────────────────────────────────────────────────────────────────────
const TOTAL_STEPS = 4
const STEP_LABELS = ['Create Account', 'Configure Domain', 'Test Email', 'Done']
const step = ref(1)

function goToStep(n: number) {
  // Only allow navigating back to an already-reached step (not step 1 — it's auto)
  if (n >= 2 && n < step.value) step.value = n
}

// ── Step 1: Account creation ─────────────────────────────────────────────────
const CREATION_MSGS = [
  'Setting up your workspace…',
  'Initializing your email adapter…',
  'Configuring your environment…',
  'Warming up the servers…',
  'Almost ready…',
]
const creatingAccount = ref(true)
const creationMsgIdx = ref(0)
let msgInterval: ReturnType<typeof setInterval> | null = null

async function createAndAdvance() {
  creatingAccount.value = true
  msgInterval = setInterval(() => {
    creationMsgIdx.value = (creationMsgIdx.value + 1) % CREATION_MSGS.length
  }, 2000)

  // Wait for background fetch (started in main.ts) to complete
  await accountStore.waitForFetch()

  // If user already has an account, skip creation entirely
  if (!accountStore.accountId) {
    // Retry loop — keep trying until we have an account
    let retryDelay = 3_000
    let created = false
    while (!created) {
      const [result] = await Promise.all([
        accountStore.createAccount(''),
        // Minimum 2s display time for the creation animation
        new Promise<void>((res) => setTimeout(res, 2000)),
      ])
      if (result.isOk()) {
        created = true
      } else {
        await new Promise<void>((res) => setTimeout(res, retryDelay))
        retryDelay = Math.min(retryDelay * 1.5, 15_000)
        // Re-fetch in case the account was created server-side but the response was lost
        await accountStore.fetchAccount()
        if (accountStore.accountId) created = true
      }
    }
  }

  if (msgInterval) { clearInterval(msgInterval); msgInterval = null }
  creatingAccount.value = false

  // Restore progress
  const ob = accountStore.account?.onboarding
  if (ob?.completed) {
    void router.replace('/inbox')
    return
  }
  if (ob?.testEmailReceived) {
    signalArrived.value = true
    step.value = 4
    return
  }
  // Hydrate before deciding which step to show; the 1000ms floor prevents a
  // flash of step 2 when we're about to advance directly to step 3.
  await Promise.all([hydrateExistingDomain(), new Promise<void>((res) => setTimeout(res, 1000))])

  step.value = allRecordsVerified.value ? 3 : 2
}

// ── Step 2: Domain ────────────────────────────────────────────────────────────
const domain = ref('')
const domainTouched = ref(false)

// Hash domain into deterministic test email username: word.word.numaeel
watchEffect(async () => {
  const d = domain.value
  if (!d) { testEmailUser.value = 'test.numaeel'; return }
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(d))
  const bytes = new Uint8Array(buf)
  const w1 = WORDS[bytes[0]! % WORDS.length]
  const w2 = WORDS[bytes[1]! % WORDS.length]
  testEmailUser.value = `${w1}.${w2}.numaeel`
})
const domainId = ref('')
const addingDomain = ref(false)
const domainAdded = ref(false)
const domainApiError = ref('')
const dnsRecords = ref<DnsRecord[]>([])
const recheckingDns = ref(false)
const mxVerifiedByClient = ref(false)
const hasRechecked = ref(false)

const domainFieldError = computed(() => {
  if (!domainTouched.value) return ''
  if (!domain.value.trim()) return 'Domain is required'
  if (!isValidDomain(domain.value)) return 'Enter a valid domain (e.g. example.com)'
  return ''
})

const allRecordsVerified = computed(() =>
  dnsRecords.value.length > 0 && dnsRecords.value.every((r) => r.status === 'verified'),
)

async function submitDomain() {
  domainTouched.value = true
  if (!isValidDomain(domain.value) || !accountStore.accountId) return
  addingDomain.value = true
  domainApiError.value = ''
  const result = await api.addDomain(accountStore.accountId, { domain: domain.value.trim() })
  addingDomain.value = false
  if (result.isErr()) { domainApiError.value = result.error.message; return }
  domainId.value = result.value.domainId
  // Records will be fetched on recheck — addDomain returns Domain without records
  domainAdded.value = true
  await recheckDns()
}

async function hydrateExistingDomain() {
  if (!accountStore.accountId) return
  const result = await api.listDomains(accountStore.accountId)
  if (result.isErr() || result.value.length === 0) return
  const existing = result.value[0]
  domain.value = existing.domain
  domainId.value = existing.domainId
  domainAdded.value = true
  // Fetch records via recheck (GET single domain returns records)
  const detail = await api.recheckDomain(accountStore.accountId, existing.domainId)
  if (detail.isOk() && 'records' in detail.value) {
    const records = (detail.value as { records: DnsRecord[] }).records
    dnsRecords.value = records
    if (records.some((r) => r.currentValue)) hasRechecked.value = true
  }
}

async function verifyWithGoogleDns(type: string, host: string): Promise<boolean> {
  try {
    const res = await fetch(
      `https://dns.google/resolve?name=${encodeURIComponent(host)}&type=${encodeURIComponent(type)}`,
    )
    if (!res.ok) return false
    const data = (await res.json()) as { Answer?: unknown[] }
    return (data.Answer?.length ?? 0) > 0
  } catch {
    return false
  }
}

async function recheckDns() {
  if (!accountStore.accountId || !domainId.value) return
  recheckingDns.value = true
  const result = await api.recheckDomain(accountStore.accountId, domainId.value)
  if (result.isOk() && 'records' in result.value) {
    dnsRecords.value = (result.value as { records: DnsRecord[] }).records
  }
  const mxRec = dnsRecords.value.find((r) => r.type === 'MX')
  if (mxRec) mxVerifiedByClient.value = await verifyWithGoogleDns('MX', mxRec.name)
  hasRechecked.value = true
  recheckingDns.value = false
}

const DNS_STATUS_COLORS: Record<string, string> = {
  verified: 'text-ctp-green',
  failing:  'text-ctp-red',
  pending:  'text-ctp-subtext0',
}

async function changeDomain() {
  if (!accountStore.accountId || !domainId.value) return
  await api.deleteDomain(accountStore.accountId, domainId.value)
  domain.value = ''
  domainTouched.value = false
  domainId.value = ''
  domainAdded.value = false
  domainApiError.value = ''
  dnsRecords.value = []
  mxVerifiedByClient.value = false
  hasRechecked.value = false
}

// ── Step 3: Test email ────────────────────────────────────────────────────────
const testEmailAddress = computed(() => `${testEmailUser.value}@${domain.value || 'yourdomain.com'}`)
const emailSentClicked = ref(false)
const signalArrived = ref(false)
let ws: WebSocket | null = null
let pollInterval: ReturnType<typeof setInterval> | null = null

function startPolling(accountId: string) {
  let attempts = 0
  logger.info({ title: 'Onboarding: starting signal poll', accountId })
  pollInterval = setInterval(async () => {
    attempts++
    if (attempts > 60) {
      logger.warn({ title: 'Onboarding: poll timeout — no signal after 60 attempts', accountId })
      clearInterval(pollInterval!)
      return
    }
    // Check both quarantined signals and arcs — test emails may not be quarantined
    const [quarantineResult, arcsResult] = await Promise.all([
      api.listQuarantinedSignals(accountId, 'quarantine_visible', { limit: 1 }),
      api.listArcs(accountId, { limit: 1 }),
    ])
    const hasSignal = quarantineResult.isOk() && quarantineResult.value.signals.length > 0
    const hasArc = arcsResult.isOk() && arcsResult.value.arcs.length > 0
    if (hasSignal || hasArc) {
      logger.info({ title: 'Onboarding: signal detected via poll', accountId, attempt: attempts, source: hasArc ? 'arc' : 'quarantine' })
      clearInterval(pollInterval!)
      void onSignalArrived()
    }
  }, 3000)
}

function connectWs(accountId: string) {
  const base = (import.meta.env.VITE_API_BASE_URL as string) ?? 'http://localhost:8787'
  const wsBase = base.startsWith('https://')
    ? base.replace('https://', 'wss://')
    : base.replace('http://', 'ws://')
  const wsUrl = `${wsBase}/accounts/${accountId}/signals/stream`
  logger.info({ title: 'Onboarding: connecting WebSocket', url: wsUrl })
  try {
    ws = new WebSocket(wsUrl)
    ws.onmessage = () => {
      logger.info({ title: 'Onboarding: signal detected via WebSocket', accountId })
      void onSignalArrived()
    }
    ws.onerror = (e) => {
      logger.warn({ title: 'Onboarding: WebSocket error, falling back to polling', accountId, error: e })
      startPolling(accountId)
    }
  } catch {
    logger.warn({ title: 'Onboarding: WebSocket connect failed, falling back to polling', accountId })
    startPolling(accountId)
  }
}

async function onSignalArrived() {
  if (signalArrived.value) return
  signalArrived.value = true
  await persistProgress({ testEmailReceived: true })
  step.value = 4
}

async function completeOnboarding() {
  await persistProgress({ completed: true })
  router.push('/inbox')
}

function markEmailSent() {
  emailSentClicked.value = true
}

// Connect WebSocket as soon as step 3 is shown
watch(step, (s) => {
  if (s === 3 && accountStore.accountId) connectWs(accountStore.accountId)
})

// ── Persistence ───────────────────────────────────────────────────────────────
async function persistProgress(patch: Partial<{
  completed: boolean
  testEmailReceived: boolean
}>) {
  if (!accountStore.accountId) return
  const result = await api.updateAccount(accountStore.accountId, { onboarding: patch })
  if (result.isOk()) accountStore.account = result.value
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────
onMounted(() => { void createAndAdvance() })

onUnmounted(() => {
  if (msgInterval) clearInterval(msgInterval)
  if (pollInterval) clearInterval(pollInterval)
  if (ws) { ws.close(); ws = null }
})
</script>

<template>
  <div class="flex min-h-screen flex-col bg-ctp-base text-ctp-text">
    <!-- Top nav -->
    <AppNavbar />

    <!-- Progress pills -->
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
          <button
            v-for="(label, i) in STEP_LABELS"
            :key="i"
            class="flex-1 text-center text-xs transition-colors"
            :class="[
              i + 1 === step ? 'font-medium text-ctp-mauve' : 'text-ctp-subtext0',
              i + 1 < step && i + 1 >= 2 ? 'cursor-pointer hover:text-ctp-text' : 'cursor-default',
            ]"
            :aria-current="i + 1 === step ? 'step' : undefined"
            :disabled="i + 1 >= step || i + 1 < 2"
            @click="goToStep(i + 1)"
          >
            {{ label }}
          </button>
        </div>
      </div>
    </header>

    <main class="mx-auto flex w-full max-w-2xl flex-1 flex-col px-6 py-10">

      <!-- ── Step 1: Account creation ─────────────────────────────────────── -->
      <section v-if="step === 1" class="flex flex-1 flex-col items-center justify-center text-center">
        <div class="mb-6 h-8 w-8 animate-spin rounded-full border-2 border-ctp-surface1 border-t-ctp-mauve" />
        <p class="text-base font-medium text-ctp-text">
          {{ CREATION_MSGS[creationMsgIdx] }}
        </p>
        <p class="mt-2 text-xs text-ctp-subtext0">This only takes a moment</p>
      </section>

      <!-- ── Step 2: Domain ─────────────────────────────────────────────────── -->
      <section v-else-if="step === 2">
        <h2 class="mb-1 text-xl font-semibold">Add your receiving domain</h2>
        <p class="mb-6 text-sm text-ctp-subtext0">
          Enter the domain you'll receive emails at. We'll generate the DNS records you need to
          add to your provider.
        </p>

        <!-- API error -->
        <div
          v-if="domainApiError"
          class="mb-4 rounded border border-ctp-red bg-ctp-red/10 px-3 py-2 text-xs text-ctp-red"
        >
          {{ domainApiError }}
        </div>

        <!-- Domain input form -->
        <form class="flex flex-wrap items-start gap-2" @submit.prevent="submitDomain">
          <div class="flex min-w-0 flex-1 flex-col gap-1">
            <input
              v-model="domain"
              type="text"
              aria-label="Domain name"
              placeholder="yourdomain.com"
              :disabled="domainAdded"
              class="w-full rounded-lg border bg-ctp-mantle px-4 py-2.5 text-sm text-ctp-text placeholder:text-ctp-subtext0 focus:outline-none disabled:opacity-50"
              :aria-invalid="!!domainFieldError"
              :aria-describedby="domainFieldError ? 'domain-error' : undefined"
              :class="domainFieldError ? 'border-ctp-red focus:border-ctp-red' : 'border-ctp-surface1 focus:border-ctp-mauve'"
              @blur="domainTouched = true"
            />
            <p v-if="domainFieldError" id="domain-error" class="text-xs text-ctp-red">{{ domainFieldError }}</p>
          </div>
          <AsyncButton
            v-if="!domainAdded"
            type="submit"
            :action="submitDomain"
            :disabled="!domain.trim()"
            class="shrink-0 rounded-lg bg-ctp-mauve px-5 py-2.5 text-sm font-medium text-ctp-base hover:opacity-90"
          >
            Add domain
          </AsyncButton>
          <button
            v-else
            type="button"
            class="shrink-0 rounded-lg border border-ctp-surface1 px-5 py-2.5 text-sm font-medium text-ctp-subtext0 hover:border-ctp-surface2 hover:text-ctp-text"
            @click="changeDomain"
          >
            Change
          </button>
        </form>

        <!-- DNS records -->
        <div v-if="dnsRecords.length" class="mt-10 space-y-3">
          <p class="text-sm font-medium text-ctp-subtext1">
            Add these DNS records to your domain provider:
          </p>

          <div
            v-for="(rec, i) in dnsRecords"
            :key="i"
            class="rounded-lg border border-ctp-surface1 p-3"
          >
            <div class="mb-2 flex items-center justify-between gap-2">
              <div class="flex items-center gap-2">
                <span class="rounded bg-ctp-surface1 px-1.5 py-0.5 font-mono text-xs text-ctp-subtext0">
                  {{ rec.type }}
                </span>
                <span class="truncate font-mono text-xs text-ctp-text">{{ rec.name }}</span>
              </div>
              <span
                v-if="hasRechecked"
                class="shrink-0 text-xs font-medium"
                :class="DNS_STATUS_COLORS[rec.status] ?? 'text-ctp-subtext0'"
              >
                {{ rec.status }}
              </span>
            </div>
            <div class="space-y-1">
              <p class="text-xs text-ctp-subtext1">Expected:</p>
              <CopyInput :value="rec.value" mono />
              <template v-if="hasRechecked && rec.currentValue">
                <p class="mt-1 text-xs" :class="rec.status === 'failing' ? 'text-ctp-red' : 'text-ctp-subtext1'">
                  Current{{ rec.status === 'failing' ? ' (invalid)' : '' }}:
                </p>
                <p class="break-all font-mono text-xs text-ctp-subtext0">{{ rec.currentValue }}</p>
              </template>
            </div>
          </div>

          <p v-if="hasRechecked" class="text-xs text-ctp-subtext0">
            DNS changes can take up to 48 hours to propagate globally. Click
            <strong>Re-check DNS</strong> after adding records to your provider.
          </p>

          <!-- Bottom action row: re-check left, continue right -->
          <div class="flex items-center justify-between pt-2">
            <AsyncButton
              v-if="!allRecordsVerified"
              :action="recheckDns"
              variant="outline"
              class="px-3 py-1.5 text-xs text-ctp-subtext0 hover:border-ctp-surface2 hover:text-ctp-text"
            >
              Re-check DNS
            </AsyncButton>
            <span v-else></span>
            <button
              :disabled="!allRecordsVerified"
              class="rounded-lg bg-ctp-mauve px-6 py-3 text-sm font-medium text-ctp-base disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90"
              @click="step = 3"
            >
              Continue to test email →
            </button>
          </div>
        </div>
      </section>

      <!-- ── Step 3: Test email ──────────────────────────────────────────────── -->
      <section v-else-if="step === 3">
        <h2 class="mb-1 text-xl font-semibold">Send us a test email</h2>
        <p class="mb-6 text-sm text-ctp-subtext0">
          Send an email to the address below to validate your setup. We'll detect it in real time.
        </p>

        <div v-if="!emailSentClicked" class="space-y-5">
          <!-- Step-by-step instructions -->
          <div class="rounded-lg border border-ctp-surface1 p-4 text-sm">
            <p class="mb-3 font-medium text-ctp-text">Two quick steps:</p>
            <ol class="space-y-3 text-ctp-subtext0">
              <li class="flex gap-3">
                <span class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ctp-mauve/20 text-xs font-semibold text-ctp-mauve">1</span>
                <span>Open your email client and compose a new email</span>
              </li>
              <li class="flex gap-3">
                <span class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ctp-mauve/20 text-xs font-semibold text-ctp-mauve">2</span>
                <span>Send it to the address below — subject and body don't matter</span>
              </li>
            </ol>
          </div>

          <div>
            <p class="mb-1.5 text-xs font-medium text-ctp-subtext0">Send to:</p>
            <CopyInput :value="testEmailAddress" mono />
          </div>

          <button
            class="rounded-lg bg-ctp-mauve px-6 py-3 text-sm font-medium text-ctp-base hover:opacity-90"
            @click="markEmailSent"
          >
            I've sent the email
          </button>
        </div>

        <!-- Watching state -->
        <div v-else class="rounded-lg border border-ctp-surface1 p-6 text-center">
          <div v-if="signalArrived" class="text-ctp-green">
            <p class="text-3xl">✓</p>
            <p class="mt-2 text-sm font-medium">Email received! Taking you to your inbox…</p>
          </div>
          <div v-else>
            <div class="mx-auto mb-3 h-6 w-6 animate-spin rounded-full border-2 border-ctp-surface1 border-t-ctp-mauve" />
            <p class="text-sm font-medium text-ctp-text">Watching for your email…</p>
            <p class="mt-1 text-xs text-ctp-subtext0">We'll detect it the moment it arrives</p>
            <div class="mt-4">
              <p class="mb-1.5 text-xs text-ctp-subtext0">Sent to:</p>
              <CopyInput :value="testEmailAddress" mono />
            </div>
          </div>
        </div>
      </section>

      <!-- ── Step 4: Done — CSS fireworks celebration ───────────────────────── -->
      <section v-else-if="step === 4" class="relative flex flex-col items-center justify-center py-16 text-center">

        <!-- CSS-only fireworks — no JavaScript ──────────────────────────────── -->
        <div class="fw" aria-hidden="true">
          <!-- 5 burst groups scattered across the viewport -->
          <div class="fw-b fw-b1">
            <span/><span/><span/><span/><span/><span/>
            <span/><span/><span/><span/><span/><span/>
          </div>
          <div class="fw-b fw-b2">
            <span/><span/><span/><span/><span/><span/>
            <span/><span/><span/><span/><span/><span/>
          </div>
          <div class="fw-b fw-b3">
            <span/><span/><span/><span/><span/><span/>
            <span/><span/><span/><span/><span/><span/>
          </div>
          <div class="fw-b fw-b4">
            <span/><span/><span/><span/><span/><span/>
            <span/><span/><span/><span/><span/><span/>
          </div>
          <div class="fw-b fw-b5">
            <span/><span/><span/><span/><span/><span/>
            <span/><span/><span/><span/><span/><span/>
          </div>
        </div>

        <!-- Done card -->
        <div class="relative z-10 flex flex-col items-center gap-5">
          <div class="flex h-20 w-20 items-center justify-center rounded-full bg-ctp-mauve/20 ring-2 ring-ctp-mauve/30">
            <svg class="h-10 w-10 text-ctp-mauve" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 4h16v16H4z" rx="2"/>
              <path d="M4 8l8 6 8-6"/>
            </svg>
          </div>

          <div>
            <h2 class="text-2xl font-bold text-ctp-text">Your email arrived!</h2>
            <p class="mt-2 max-w-sm text-sm text-ctp-subtext0">
              Setup is complete. Your inbox is ready — head over to see your first message and
              start exploring what SES Adapter can do.
            </p>
          </div>

          <AsyncButton
            :action="completeOnboarding"
            class="rounded-lg bg-ctp-mauve px-8 py-3 text-sm font-semibold text-ctp-base hover:opacity-90"
          >
            See the result →
          </AsyncButton>
        </div>
      </section>

    </main>
  </div>
</template>

<style scoped>
/* ── CSS-only fireworks — no JavaScript required ─────────────────────────────
   Each .fw-b is a burst origin (0×0 point).  Its <span> children are particles
   that shoot radially outward using rotate(--a) translateY(-dist) so the
   direction is baked into a CSS custom property — no script needed.
   ─────────────────────────────────────────────────────────────────────────── */

.fw {
  position: fixed;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  z-index: 0;
}

/* ── Burst origin positions ── */
.fw-b {
  position: absolute;
  width: 0;
  height: 0;
}
.fw-b1 { left: 18%;  top: 22%; }
.fw-b2 { left: 78%;  top: 16%; }
.fw-b3 { left: 50%;  top: 50%; }
.fw-b4 { left: 14%;  top: 70%; }
.fw-b5 { left: 82%;  top: 68%; }

/* ── Particles ── */
.fw-b > span {
  position: absolute;
  display: block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  /* centred on burst origin */
  top: -3px;
  left: -3px;
  animation: fw-spark 1.5s cubic-bezier(0.22, 0.61, 0.36, 1) infinite;
}

/* 12 particles, evenly spread at 30° intervals */
.fw-b > span:nth-child(1)  { --a: 0deg   }
.fw-b > span:nth-child(2)  { --a: 30deg  }
.fw-b > span:nth-child(3)  { --a: 60deg  }
.fw-b > span:nth-child(4)  { --a: 90deg  }
.fw-b > span:nth-child(5)  { --a: 120deg }
.fw-b > span:nth-child(6)  { --a: 150deg }
.fw-b > span:nth-child(7)  { --a: 180deg }
.fw-b > span:nth-child(8)  { --a: 210deg }
.fw-b > span:nth-child(9)  { --a: 240deg }
.fw-b > span:nth-child(10) { --a: 270deg }
.fw-b > span:nth-child(11) { --a: 300deg }
.fw-b > span:nth-child(12) { --a: 330deg }

/* ── Per-burst timing offsets ── */
.fw-b1 > span { animation-delay: 0s;     }
.fw-b2 > span { animation-delay: 0.38s;  }
.fw-b3 > span { animation-delay: 0.76s;  }
.fw-b4 > span { animation-delay: 0.19s;  }
.fw-b5 > span { animation-delay: 0.57s;  }

/* ── Per-burst colours (odd = primary, even = accent) ── */
.fw-b1 > span              { background: #cba6f7; } /* mauve     */
.fw-b1 > span:nth-child(even) { background: #f5c2e7; } /* pink      */

.fw-b2 > span              { background: #89b4fa; } /* blue      */
.fw-b2 > span:nth-child(even) { background: #74c7ec; } /* sapphire  */

.fw-b3 > span              { background: #a6e3a1; } /* green     */
.fw-b3 > span:nth-child(even) { background: #94e2d5; } /* teal      */

.fw-b4 > span              { background: #fab387; } /* peach     */
.fw-b4 > span:nth-child(even) { background: #f9e2af; } /* yellow    */

.fw-b5 > span              { background: #f38ba8; } /* red       */
.fw-b5 > span:nth-child(even) { background: #eba0ac; } /* maroon    */

/* ── Keyframe: radial outward burst ──
   rotate(--a) puts the particle on the right bearing;
   translateY then moves it along that rotated Y axis (away from origin).
   Scale + opacity fade complete the "spark trails off" look.
   ─────────────────────────────────────────────────────────────────────── */
@keyframes fw-spark {
  0% {
    transform: rotate(var(--a)) translateY(0)    scale(1);
    opacity: 1;
  }
  60% {
    opacity: 0.7;
  }
  100% {
    transform: rotate(var(--a)) translateY(-110px) scale(0.2);
    opacity: 0;
  }
}
</style>

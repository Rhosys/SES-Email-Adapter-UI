<script setup lang="ts">
import { useAccountStore } from '@/stores/account'
import { api } from '@/lib/api'
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { Account, BillingInfo, BillingPlan } from '@/types/server'

const accountStore = useAccountStore()
const route = useRoute()
const router = useRouter()

const account = ref<Account | null>(null)
const billing = ref<BillingInfo | null>(null)
const loading = ref(true)
const upgrading = ref<string | null>(null)
const portalLoading = ref(false)
const showSuccess = ref(route.query.success === 'true')

if (showSuccess.value) {
  void router.replace({ query: {} })
}

interface PlanDef {
  id: BillingPlan
  name: string
  price: string
  period: string
  priceId: string | undefined
  features: string[]
  recommended?: boolean
}

// TODO: Replace with actual Stripe price IDs from your Stripe dashboard once the account is set up
// (Dashboard → Products → select product → copy Price ID, format: price_1ABC...)
const starterPriceId = 'price_TODO_starter'
const proPriceId = 'price_TODO_pro'

const PLANS: PlanDef[] = [
  {
    id: 'free',
    name: 'Free',
    price: '$0',
    period: '',
    priceId: undefined,
    features: ['1 domain', '500 signals / month', 'Quarantine & basic filtering', '1 team member'],
  },
  {
    id: 'starter',
    name: 'Starter',
    price: '$19',
    period: '/ month',
    priceId: starterPriceId,
    features: [
      '5 domains',
      '5,000 signals / month',
      'Rules engine',
      'Labels & custom views',
      'Up to 5 team members',
    ],
    recommended: true,
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$49',
    period: '/ month',
    priceId: proPriceId,
    features: [
      'Unlimited domains',
      'Unlimited signals',
      'Email templates',
      'Audit log',
      'Unlimited team members',
      'Priority support',
    ],
  },
]

const currentPlan = computed<BillingPlan>(() => billing.value?.plan ?? 'free')

onMounted(async () => {
  if (!accountStore.accountId) await accountStore.fetchAccount()
  loading.value = false
  if (!accountStore.accountId) return

  const [accountResult, billingResult] = await Promise.all([
    api.getAccount(accountStore.accountId),
    api.getBilling(accountStore.accountId),
  ])
  if (accountResult.isOk()) account.value = accountResult.value
  if (billingResult.isOk()) billing.value = billingResult.value
  // getBilling silently fails until backend is implemented — defaults to 'free'
})

async function upgrade(plan: PlanDef) {
  if (!plan.priceId || !accountStore.accountId) return
  upgrading.value = plan.id
  const result = await api.createCheckoutSession(accountStore.accountId, {
    priceId: plan.priceId,
    successUrl: `${window.location.origin}/billing?success=true`,
    cancelUrl: `${window.location.origin}/billing`,
  })
  upgrading.value = null
  if (result.isOk()) {
    window.location.href = result.value.url
  }
}

async function openPortal() {
  if (!accountStore.accountId) return
  portalLoading.value = true
  const result = await api.createBillingPortalSession(accountStore.accountId, {
    returnUrl: `${window.location.origin}/billing`,
  })
  portalLoading.value = false
  if (result.isOk()) {
    window.location.href = result.value.url
  }
}
</script>

<template>
  <div>
    <header class="border-b border-ctp-surface0 bg-ctp-mantle px-4 py-3">
      <h1 class="text-lg font-semibold">Billing</h1>
      <p class="mt-0.5 text-xs text-ctp-subtext0">Manage your plan and payment details</p>
    </header>

    <main class="mx-auto max-w-2xl space-y-6 px-4 py-6">
      <!-- Success banner -->
      <div
        v-if="showSuccess"
        class="rounded-lg border border-ctp-green bg-ctp-green/10 px-4 py-3 text-sm text-ctp-green"
      >
        ✓ Payment successful — your plan has been upgraded.
      </div>

      <!-- Loading -->
      <div
        v-if="loading"
        role="status"
        aria-label="Loading billing…"
        class="animate-pulse space-y-4"
      >
        <div class="rounded-lg border border-ctp-surface1 p-4">
          <div class="flex items-start justify-between gap-4">
            <div class="space-y-1.5">
              <div class="h-3 w-16 rounded bg-ctp-surface1" />
              <div class="h-4 w-40 rounded bg-ctp-surface1" />
              <div class="h-3 w-24 rounded bg-ctp-surface1" />
            </div>
            <div class="space-y-1.5 text-right">
              <div class="h-3 w-20 rounded bg-ctp-surface1" />
              <div class="h-4 w-16 rounded bg-ctp-surface1" />
            </div>
          </div>
        </div>
        <div class="rounded-lg border border-ctp-surface1 p-4">
          <div class="h-4 w-32 rounded bg-ctp-surface1" />
          <div class="mt-3 space-y-2">
            <div v-for="i in 3" :key="i" class="flex justify-between">
              <div class="h-3 w-28 rounded bg-ctp-surface1" />
              <div class="h-3 w-16 rounded bg-ctp-surface1" />
            </div>
          </div>
        </div>
      </div>

      <template v-else>
        <!-- Account + current plan -->
        <div class="rounded-lg border border-ctp-surface1 p-4">
          <div class="flex items-start justify-between gap-4">
            <div>
              <p class="text-xs text-ctp-subtext0">Account</p>
              <p class="mt-0.5 text-sm font-semibold text-ctp-text">{{ account?.name ?? '—' }}</p>
              <p class="text-xs text-ctp-subtext0">ID: {{ accountStore.accountId }}</p>
            </div>
            <div class="text-right">
              <p class="text-xs text-ctp-subtext0">Current plan</p>
              <p class="mt-0.5 text-sm font-semibold capitalize text-ctp-mauve">
                {{ currentPlan }}
              </p>
              <p v-if="billing?.currentPeriodEnd" class="text-xs text-ctp-subtext0">
                Renews {{ new Date(billing.currentPeriodEnd).toLocaleDateString() }}
              </p>
              <p v-if="billing?.cancelAtPeriodEnd" class="text-xs text-ctp-red">
                Cancels at period end
              </p>
            </div>
          </div>

          <!-- Manage subscription (paid plans) -->
          <div v-if="currentPlan !== 'free'" class="mt-4 border-t border-ctp-surface1 pt-4">
            <button
              :disabled="portalLoading"
              class="rounded-lg border border-ctp-surface1 px-4 py-2 text-sm text-ctp-text hover:border-ctp-surface2 disabled:opacity-50"
              @click="openPortal"
            >
              {{ portalLoading ? 'Loading…' : 'Manage subscription ↗' }}
            </button>
          </div>
        </div>

        <!-- Plan comparison -->
        <div>
          <h2 class="mb-3 text-sm font-semibold text-ctp-text">Plans</h2>
          <div class="grid gap-3 sm:grid-cols-3">
            <div
              v-for="plan in PLANS"
              :key="plan.id"
              class="relative rounded-lg border p-4"
              :class="
                plan.id === currentPlan ? 'border-ctp-mauve bg-ctp-mauve/5' : 'border-ctp-surface1'
              "
            >
              <div
                v-if="plan.recommended && plan.id !== currentPlan"
                class="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-ctp-mauve px-2.5 py-0.5 text-xs font-medium text-ctp-base"
              >
                Recommended
              </div>
              <div
                v-if="plan.id === currentPlan"
                class="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-ctp-green px-2.5 py-0.5 text-xs font-medium text-ctp-base"
              >
                Current plan
              </div>

              <p class="text-sm font-semibold text-ctp-text">{{ plan.name }}</p>
              <p class="mt-1 text-lg font-bold text-ctp-text">
                {{ plan.price }}
                <span v-if="plan.period" class="text-xs font-normal text-ctp-subtext0">{{
                  plan.period
                }}</span>
              </p>

              <ul class="mt-3 space-y-1.5">
                <li
                  v-for="feature in plan.features"
                  :key="feature"
                  class="flex items-start gap-1.5 text-xs text-ctp-subtext1"
                >
                  <span class="mt-0.5 shrink-0 text-ctp-green">✓</span>
                  {{ feature }}
                </li>
              </ul>

              <div class="mt-4">
                <span
                  v-if="plan.id === currentPlan"
                  class="block text-center text-xs text-ctp-subtext0"
                >
                  Active
                </span>
                <button
                  v-else-if="plan.id === 'free'"
                  disabled
                  class="w-full rounded-lg border border-ctp-surface1 py-1.5 text-xs text-ctp-subtext0 opacity-50"
                >
                  Free forever
                </button>
                <button
                  v-else-if="!plan.priceId"
                  disabled
                  class="w-full rounded-lg border border-ctp-surface1 py-1.5 text-xs text-ctp-subtext0 opacity-50"
                >
                  Coming soon
                </button>
                <button
                  v-else
                  :disabled="upgrading !== null"
                  class="w-full rounded-lg bg-ctp-mauve py-1.5 text-xs font-medium text-ctp-base hover:opacity-90 disabled:opacity-50"
                  @click="upgrade(plan)"
                >
                  {{ upgrading === plan.id ? 'Redirecting…' : `Upgrade to ${plan.name}` }}
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Pricing note -->
        <p class="text-xs text-ctp-subtext0">
          All prices in USD. Subscriptions renew monthly. Cancel any time from the billing portal.
        </p>
      </template>
    </main>
  </div>
</template>

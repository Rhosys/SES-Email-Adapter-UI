<script setup lang="ts">
import { useAccountStore } from '@/stores/account'
import { api } from '@/lib/api'
import { useCurrency } from '@/lib/currency'
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { Account, BillingInfo, BillingPlan } from '@/types/server'
import AsyncButton from '@/components/ui/AsyncButton.vue'

const accountStore = useAccountStore()
const route = useRoute()
const router = useRouter()
const { currency, formatPrice } = useCurrency()

const account = ref<Account | null>(null)
const billing = ref<BillingInfo | null>(null)
const loading = ref(true)
const upgrading = ref<string | null>(null)
const portalLoading = ref(false)
const showSuccess = ref(route.query.success === 'true')
const mode = ref<'personal' | 'business'>('personal')

const accentColor = computed(() => mode.value === 'business' ? 'blue' : 'mauve')

if (showSuccess.value) {
  void router.replace({ query: {} })
}

interface PlanDef {
  id: BillingPlan
  name: string
  eurBasePrice: number
  period: string
  priceId: string | undefined
  features: string[]
  recommended?: boolean
  accent?: string
}

const PERSONAL_PLANS: PlanDef[] = [
  {
    id: 'free',
    name: 'Free',
    eurBasePrice: 0,
    period: '/forever · one inbox',
    priceId: undefined,
    features: [
      'Three custom domains',
      'Catch-all email on every domain',
      'Unlimited aliases + per-site generator',
      'Unlimited labels & views',
      'Workflow classification (14 workflows)',
      'Quarantine with allow / block / reject',
      'Browser extension + OTP autofill',
      '5 GB storage · 6 months retention',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    eurBasePrice: 2,
    period: '/month · flat',
    priceId: 'price_pro_monthly',
    features: [
      'Everything in Free, plus —',
      'Unlimited domains',
      'JMAP (Apple Mail, Thunderbird, Mimestream)',
      'GPG-encrypted transport for outbound',
      'Custom JavaScript rules + templates',
      'No-click DPA filing for 35+ jurisdictions',
      'Outbound webhooks (Slack, Linear, Zapier)',
      '100 GB storage · 5 years retention',
    ],
    recommended: true,
  },
  {
    id: 'premium',
    name: 'Premium',
    eurBasePrice: 6,
    period: '/month · flat',
    priceId: 'price_premium_monthly',
    features: [
      'Everything in Pro, plus —',
      'Priority support from a real person',
      'Priority routing on the processing pipeline',
      'Migration assist from Gmail / Outlook / Fastmail',
      'White-glove onboarding + rule-design workshop',
      '1 TB storage · full audit trail',
    ],
    accent: 'peach',
  },
]

const BUSINESS_PLANS: PlanDef[] = [
  {
    id: 'team',
    name: 'Team',
    eurBasePrice: 10,
    period: '/month · flat',
    priceId: 'price_team_monthly',
    features: [
      'Everything in Personal Pro, org-wide',
      'Unlimited company domains',
      'Shared & role-based aliases (support@, billing@)',
      'Admin console + role-based access',
      'Google / Microsoft SSO',
      '100 GB pooled storage',
      'Unlimited users',
    ],
  },
  {
    id: 'company',
    name: 'Company',
    eurBasePrice: 100,
    period: '/month · flat',
    priceId: 'price_company_monthly',
    features: [
      'Everything in Team, plus —',
      'Unlimited retention + legal hold',
      'Full audit trail + export',
      'SAML SSO + SCIM provisioning',
      'Custom rules per department',
      '1 TB pooled storage',
      'Unlimited users',
    ],
    recommended: true,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    eurBasePrice: 1000,
    period: '/month · flat',
    priceId: 'price_enterprise_monthly',
    features: [
      'Everything in Company, plus —',
      'Dedicated account manager',
      'SLA with uptime guarantee',
      'Custom data residency',
      'On-premise relay option',
      'Unlimited storage',
      'Unlimited users',
    ],
    accent: 'peach',
  },
]

const plans = computed(() => mode.value === 'personal' ? PERSONAL_PLANS : BUSINESS_PLANS)
const currentPlan = computed<BillingPlan>(() => billing.value?.plan ?? 'free')

onMounted(async () => {
  loading.value = false
  if (!accountStore.accountId) return

  const [accountResult, billingResult] = await Promise.all([
    api.getAccount(accountStore.accountId),
    api.getBilling(accountStore.accountId),
  ])
  if (accountResult.isOk()) account.value = accountResult.value
  if (billingResult.isOk()) billing.value = billingResult.value
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
  <div class="mx-auto max-w-2xl space-y-6">
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
          <AsyncButton
            :action="openPortal"
            variant="outline"
            class="px-4 py-2 text-sm text-ctp-text hover:border-ctp-surface2"
          >
            Manage subscription ↗
          </AsyncButton>
        </div>
      </div>

      <!-- Mode toggle -->
      <div class="flex justify-center">
        <div class="inline-flex rounded-full border border-ctp-surface0 bg-ctp-mantle p-1">
          <button
            class="rounded-full px-4 py-1.5 text-xs font-medium transition-all"
            :class="mode === 'personal' ? 'bg-ctp-mauve text-ctp-base' : 'text-ctp-subtext0 hover:text-ctp-text'"
            @click="mode = 'personal'"
          >
            Personal
          </button>
          <button
            class="rounded-full px-4 py-1.5 text-xs font-medium transition-all"
            :class="mode === 'business' ? 'bg-ctp-blue text-ctp-base' : 'text-ctp-subtext0 hover:text-ctp-text'"
            @click="mode = 'business'"
          >
            Business
          </button>
        </div>
      </div>

      <!-- Plan comparison -->
      <div>
        <h2 class="mb-3 text-sm font-semibold text-ctp-text">
          {{ mode === 'personal' ? 'Personal plans' : 'Business plans' }}
        </h2>
        <div class="grid gap-3 sm:grid-cols-3">
          <div
            v-for="plan in plans"
            :key="plan.id"
            class="relative rounded-lg border p-4"
            :class="
              plan.id === currentPlan
                ? `border-ctp-${accentColor} bg-ctp-${accentColor}/5`
                : 'border-ctp-surface1'
            "
          >
            <div
              v-if="plan.recommended && plan.id !== currentPlan"
              class="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full px-2.5 py-0.5 text-xs font-medium text-ctp-base"
              :class="`bg-ctp-${accentColor}`"
            >
              Most Obvious
            </div>
            <div
              v-if="plan.id === currentPlan"
              class="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-ctp-green px-2.5 py-0.5 text-xs font-medium text-ctp-base"
            >
              Current plan
            </div>

            <p class="text-sm font-semibold text-ctp-text">{{ plan.name }}</p>
            <p class="mt-1 text-lg font-bold text-ctp-text">
              {{ formatPrice(plan.eurBasePrice) }}
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
              <AsyncButton
                v-else
                :action="() => upgrade(plan)"
                class="w-full rounded-lg py-1.5 text-xs font-medium text-ctp-base hover:opacity-90"
                :class="`bg-ctp-${accentColor}`"
              >
                Upgrade to {{ plan.name }}
              </AsyncButton>
            </div>
          </div>
        </div>
      </div>

      <!-- Pricing note -->
      <p class="text-xs text-ctp-subtext0">
        All prices in {{ currency.code }}. Subscriptions renew monthly. Cancel any time from the billing portal.
      </p>
    </template>
  </div>
</template>

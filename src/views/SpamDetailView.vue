<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'
import { useRoute, RouterLink } from 'vue-router'
import { useSpamStore } from '@/stores/spam'
import { useRulesStore } from '@/stores/rules'
import { isInboundEmailSignal } from '@/lib/signal-guards'
import { conditionSummary } from '@/lib/rule-display'
import SignalRenderer from '@/components/SignalRenderer.vue'
import ActionBadge from '@/components/ActionBadge.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import SenderInfoPopup from '@/components/SenderInfoPopup.vue'
import { useAccountStore } from '@/stores/account'

const route = useRoute()
const spamStore = useSpamStore()
const rulesStore = useRulesStore()
const accountStore = useAccountStore()

const signalId = computed(() => route.params.id as string)
const loading = ref(true)
const notFound = ref(false)
const showSenderPopup = ref(false)

const signal = computed(() =>
  [...spamStore.blockHidden, ...spamStore.blockReject].find(
    (s) => s.signalId === signalId.value,
  ) ?? null,
)

const inboundData = computed(() => (signal.value && isInboundEmailSignal(signal.value) ? signal.value.data : null))
const matchedRules = computed(() => inboundData.value?.matchedRules ?? [])

const expandedRuleIds = ref<Set<string>>(new Set())
function toggleRule(ruleId: string) {
  const next = new Set(expandedRuleIds.value)
  if (next.has(ruleId)) next.delete(ruleId)
  else next.add(ruleId)
  expandedRuleIds.value = next
}

function ruleFor(ruleId: string) {
  return rulesStore.items.find((r) => r.ruleId === ruleId)
}

onMounted(async () => {
  loading.value = true
  if (!signal.value) {
    await spamStore.fetchSignals(true)
  }
  await rulesStore.fetchRules()
  loading.value = false
  notFound.value = !signal.value
})

function onSignalReprocessed() {
  void spamStore.fetchSignals(true)
}
</script>

<template>
  <div class="quarantine-detail mx-auto flex min-h-full max-w-3xl flex-col px-4 py-6">
    <RouterLink
      to="/spam"
      class="mb-4 inline-flex items-center gap-1 text-sm text-ctp-subtext0 hover:text-ctp-text"
    >
      ← Back to spam
    </RouterLink>

    <!-- Loading -->
    <div
      v-if="loading"
      role="status"
      aria-label="Loading blocked email…"
      class="animate-pulse"
    >
      <div class="mb-6 space-y-2">
        <div class="h-6 w-2/3 rounded bg-ctp-surface1" />
        <div class="h-3 w-32 rounded bg-ctp-surface1" />
      </div>
      <div class="rounded-lg border border-ctp-surface0 bg-ctp-mantle p-4">
        <div class="mb-3 flex items-center gap-2">
          <div class="h-3 w-28 rounded bg-ctp-surface1" />
        </div>
        <div class="space-y-2">
          <div class="h-4 w-full rounded bg-ctp-surface1" />
          <div class="h-4 w-3/4 rounded bg-ctp-surface1" />
        </div>
      </div>
    </div>

    <!-- Not found -->
    <div
      v-else-if="notFound"
      role="alert"
      class="rounded-lg border border-ctp-red bg-ctp-red/10 px-4 py-3 text-sm text-ctp-red"
    >
      This email is no longer in the blocked list — it may have been reprocessed.
    </div>

    <template v-else-if="signal && inboundData">
      <!-- Header -->
      <div class="mb-6">
        <div class="flex items-center gap-2">
          <StatusBadge :status="signal.status" />
          <h1 class="text-lg font-semibold text-ctp-text">{{ inboundData.subject || '(no subject)' }}</h1>
        </div>
        <div class="mt-1 text-sm text-ctp-subtext1">
          <span class="relative">
            <span class="text-ctp-overlay1">From:</span>
            <button
              type="button"
              class="cursor-pointer hover:text-ctp-mauve hover:underline"
              @click="showSenderPopup = !showSenderPopup"
            >
              {{ inboundData.from.name || inboundData.from.address }}
              <span v-if="inboundData.from.name" class="text-ctp-subtext0">&lt;{{ inboundData.from.address }}&gt;</span>
            </button>
            <div v-if="showSenderPopup && accountStore.accountId && inboundData.recipientAddress" class="absolute left-0 top-full z-20 mt-1">
              <SenderInfoPopup
                :sender-address="inboundData.from.address"
                :alias-address="inboundData.recipientAddress"
                :account-id="accountStore.accountId"
              />
            </div>
          </span>
        </div>
        <div v-if="inboundData.recipientAddress" class="mt-1 text-sm text-ctp-subtext1">
          <span class="text-ctp-overlay1">Alias:</span> <span class="text-ctp-sapphire">{{ inboundData.recipientAddress }}</span>
        </div>
      </div>

      <!-- Matched rules -->
      <div v-if="matchedRules.length" class="mb-6">
        <h2 class="mb-2 text-xs font-medium uppercase tracking-wide text-ctp-subtext0">Matched rules</h2>
        <div class="divide-y divide-ctp-surface0 rounded-lg border border-ctp-surface0">
          <div v-for="matched in matchedRules" :key="matched.ruleId" class="px-4 py-3">
            <div class="flex flex-wrap items-center gap-2">
              <button
                type="button"
                class="flex items-center gap-1 text-sm font-medium text-ctp-text hover:text-ctp-mauve"
                :aria-expanded="expandedRuleIds.has(matched.ruleId)"
                @click="toggleRule(matched.ruleId)"
              >
                <svg
                  class="h-3 w-3 shrink-0 transition-transform"
                  :class="{ 'rotate-90': expandedRuleIds.has(matched.ruleId) }"
                  viewBox="0 0 16 16"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M6 4l4 4-4 4V4z" />
                </svg>
                {{ matched.text ?? ruleFor(matched.ruleId)?.name ?? matched.ruleId }}
              </button>
              <ActionBadge v-for="action in matched.actions" :key="action.type" :type="action.type" />
              <RouterLink
                v-if="ruleFor(matched.ruleId)"
                :to="`/rules/${matched.ruleId}`"
                class="ml-auto flex shrink-0 items-center gap-1 text-xs text-ctp-subtext0 hover:text-ctp-text"
                title="Open this rule in the rule editor"
              >
                Open rule
                <svg class="h-3 w-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M6 3h7v7M13 3L3 13" />
                </svg>
              </RouterLink>
            </div>

            <div v-if="expandedRuleIds.has(matched.ruleId)" class="mt-2 rounded-lg bg-ctp-surface0 px-3 py-2">
              <p v-if="matched.text" class="text-xs text-ctp-subtext1">{{ matched.text }}</p>
              <p v-else-if="ruleFor(matched.ruleId)" class="font-mono text-xs text-ctp-subtext0">
                {{ conditionSummary(ruleFor(matched.ruleId)!) }}
              </p>
              <p v-else class="text-xs text-ctp-subtext0">Rule details unavailable — it may have been deleted.</p>
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

      <!-- Email body (includes reprocess button via EmailSignalCard) -->
      <SignalRenderer :signal="signal" @reprocessed="onSignalReprocessed" />
    </template>
  </div>
</template>

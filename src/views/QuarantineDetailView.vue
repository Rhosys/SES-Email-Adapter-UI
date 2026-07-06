<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import { useQuarantineStore } from '@/stores/quarantine'
import { useRulesStore } from '@/stores/rules'
import { isInboundEmailSignal } from '@/lib/signal-guards'
import { conditionSummary } from '@/lib/rule-display'
import SignalRenderer from '@/components/SignalRenderer.vue'
import AsyncButton from '@/components/ui/AsyncButton.vue'
import ActionBadge from '@/components/ActionBadge.vue'
import StatusBadge from '@/components/StatusBadge.vue'

const route = useRoute()
const router = useRouter()
const quarantineStore = useQuarantineStore()
const rulesStore = useRulesStore()

const signalId = computed(() => route.params.id as string)
const loading = ref(true)
const notFound = ref(false)

const signal = computed(() =>
  [...quarantineStore.quarantineVisible, ...quarantineStore.quarantineHidden].find(
    (s) => s.signalId === signalId.value,
  ) ?? null,
)

const inboundData = computed(() => (signal.value && isInboundEmailSignal(signal.value) ? signal.value.data : null))
const matchedRules = computed(() => inboundData.value?.matchedRules ?? [])
const pending = computed(() => (signal.value ? quarantineStore.actionPending.has(signal.value.signalId) : false))

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
    await quarantineStore.fetchSignals(true)
  }
  await rulesStore.fetchRules()
  loading.value = false
  notFound.value = !signal.value
})

async function allow() {
  if (!signal.value) return
  const threadId = await quarantineStore.allow(signal.value.signalId)
  if (threadId) {
    void router.push({ name: 'thread-detail', params: { id: threadId } })
  }
}

async function reject() {
  if (!signal.value) return
  const ok = await quarantineStore.reject(signal.value.signalId)
  if (ok) void router.push('/quarantine')
}

const showReplyBlockedDialog = ref(false)
function onReplyAttempt() {
  showReplyBlockedDialog.value = true
}

function onSignalReprocessed() {
  void quarantineStore.fetchSignals(true)
}
</script>

<template>
  <div class="quarantine-detail mx-auto flex min-h-full max-w-3xl flex-col px-4 py-6">
    <RouterLink
      to="/quarantine"
      class="mb-4 inline-flex items-center gap-1 text-sm text-ctp-subtext0 hover:text-ctp-text"
    >
      ← Back to quarantine
    </RouterLink>

    <!-- Loading -->
    <div
      v-if="loading"
      role="status"
      aria-label="Loading quarantined email…"
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
      This email is no longer in quarantine — it may have already been allowed or rejected.
    </div>

    <template v-else-if="signal && inboundData">
      <!-- Header -->
      <div class="mb-6">
        <div class="flex items-center gap-2">
          <StatusBadge :status="signal.status" />
          <h1 class="text-lg font-semibold text-ctp-text">{{ inboundData.subject || '(no subject)' }}</h1>
        </div>
        <div class="mt-1 text-sm text-ctp-subtext1">
          <span class="text-ctp-overlay1">From:</span>
          {{ inboundData.from.name || inboundData.from.address }}
          <span v-if="inboundData.from.name" class="text-ctp-subtext0">&lt;{{ inboundData.from.address }}&gt;</span>
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

      <!-- Actions -->
      <div class="mb-6 flex flex-wrap items-center gap-2">
        <AsyncButton
          :action="allow"
          :disabled="pending"
          variant="ghost"
          class="rounded bg-ctp-green/15 px-3 py-1.5 text-sm font-medium text-ctp-green hover:bg-ctp-green/25"
        >
          Allow Sender
        </AsyncButton>
        <AsyncButton
          :action="reject"
          :disabled="pending"
          variant="ghost"
          class="rounded bg-ctp-red/15 px-3 py-1.5 text-sm font-medium text-ctp-red hover:bg-ctp-red/25"
        >
          Reject Sender
        </AsyncButton>
        <RouterLink
          :to="`/rules/new?signalId=${signal.signalId}&action=block_hidden`"
          class="rounded border border-ctp-surface1 px-3 py-1.5 text-sm text-ctp-subtext1 transition-colors hover:text-ctp-text"
        >
          Create Rule
        </RouterLink>
      </div>

      <!-- Email body -->
      <SignalRenderer :signal="signal" @reply="onReplyAttempt" @reprocessed="onSignalReprocessed" />
    </template>

    <!-- Reply blocked dialog -->
    <Teleport to="body">
      <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions,vuejs-accessibility/click-events-have-key-events -->
      <div v-if="showReplyBlockedDialog" class="fixed inset-0 z-[200] flex items-center justify-center bg-ctp-base/80" @click.self="showReplyBlockedDialog = false">
        <div class="w-full max-w-sm rounded-xl border border-ctp-surface1 bg-ctp-mantle p-5 shadow-2xl">
          <h3 class="mb-2 text-sm font-semibold text-ctp-text">Cannot reply to quarantined email</h3>
          <p class="mb-4 text-sm text-ctp-subtext1">
            You must allow this sender before you can reply. Click "Allow Sender" to approve and move this email to your inbox.
          </p>
          <button
            class="rounded bg-ctp-surface1 px-3 py-1.5 text-sm text-ctp-text hover:bg-ctp-surface2"
            @click="showReplyBlockedDialog = false"
          >
            OK
          </button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

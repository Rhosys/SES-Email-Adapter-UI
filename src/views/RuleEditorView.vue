<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAccountStore } from '@/stores/account'
import { useRulesStore } from '@/stores/rules'
import { useQuarantineStore } from '@/stores/quarantine'
import type {
  RuleAction,
  RuleCondition,
  RuleConditionField,
  RuleConditionOperator,
} from '@/types/server'

const route = useRoute()
const router = useRouter()
const accountStore = useAccountStore()
const rulesStore = useRulesStore()
const quarantineStore = useQuarantineStore()

// Query params from quarantine row links
const signalId = computed(() => (route.query.signalId as string) ?? null)
const signalAction = computed(() => (route.query.action as 'allow' | 'block') ?? null)
const ruleId = computed(() => (route.params.id as string) ?? null)
const isEditing = computed(() => !!ruleId.value)

// Form state
const name = ref('')
const action = ref<RuleAction>('allow')
const conditions = ref<RuleCondition[]>([{ field: 'from.address', operator: 'equals', value: '' }])
const testInput = ref({ fromAddress: '', subject: '' })
const testResult = ref<null | { matches: boolean; matchedConditions: number[] }>(null)

const FIELDS: { value: RuleConditionField; label: string }[] = [
  { value: 'from.address', label: 'Sender address' },
  { value: 'from.domain', label: 'Sender domain' },
  { value: 'subject', label: 'Subject' },
]

const OPERATORS: { value: RuleConditionOperator; label: string }[] = [
  { value: 'equals', label: 'equals' },
  { value: 'contains', label: 'contains' },
  { value: 'starts_with', label: 'starts with' },
  { value: 'ends_with', label: 'ends with' },
]

const ACTIONS: { value: RuleAction; label: string; description: string }[] = [
  { value: 'allow', label: 'Allow', description: 'Deliver to inbox' },
  { value: 'block', label: 'Block', description: 'Reject the email' },
  { value: 'quarantine', label: 'Quarantine', description: 'Hold for review' },
  { value: 'label', label: 'Label', description: 'Tag and deliver' },
]

function addCondition() {
  conditions.value = [
    ...conditions.value,
    { field: 'from.address', operator: 'contains', value: '' },
  ]
}

function removeCondition(idx: number) {
  conditions.value = conditions.value.filter((_, i) => i !== idx)
}

function updateCondition(idx: number, patch: Partial<RuleCondition>) {
  conditions.value = conditions.value.map((c, i) => (i === idx ? { ...c, ...patch } : c))
}

// Client-side rule tester
function runTest() {
  const matchedConditions: number[] = []
  for (let i = 0; i < conditions.value.length; i++) {
    const c = conditions.value[i]
    let subject = ''
    if (c.field === 'from.address') subject = testInput.value.fromAddress
    else if (c.field === 'from.domain') subject = testInput.value.fromAddress.split('@')[1] ?? ''
    else if (c.field === 'subject') subject = testInput.value.subject
    let match = false
    if (c.operator === 'equals') match = subject === c.value
    else if (c.operator === 'contains') match = subject.includes(c.value)
    else if (c.operator === 'starts_with') match = subject.startsWith(c.value)
    else if (c.operator === 'ends_with') match = subject.endsWith(c.value)
    if (match) matchedConditions.push(i)
  }
  testResult.value = {
    matches: matchedConditions.length === conditions.value.length && conditions.value.length > 0,
    matchedConditions,
  }
}

const canSave = computed(
  () =>
    name.value.trim().length > 0 &&
    conditions.value.length > 0 &&
    conditions.value.every((c) => c.value.trim().length > 0),
)

async function save() {
  if (!accountStore.accountId || !canSave.value) return
  const body = { name: name.value.trim(), conditions: conditions.value, action: action.value }

  let saved
  if (isEditing.value) {
    saved = await rulesStore.updateRule(accountStore.accountId, ruleId.value!, body)
  } else {
    saved = await rulesStore.createRule(accountStore.accountId, body)
  }

  if (!saved) return // error already set in store

  // If we came from quarantine with a signalId, resolve the signal
  if (signalId.value && signalAction.value) {
    if (signalAction.value === 'block') {
      await quarantineStore.reject(accountStore.accountId, signalId.value)
    } else {
      await quarantineStore.allow(accountStore.accountId, signalId.value)
    }
    void router.push('/quarantine')
  } else {
    void router.push('/rules')
  }
}

onMounted(async () => {
  if (!accountStore.accountId) await accountStore.fetchAccount()

  if (isEditing.value) {
    // Load existing rule
    if (rulesStore.items.length === 0 && accountStore.accountId) {
      await rulesStore.fetchRules(accountStore.accountId)
    }
    const existing = rulesStore.items.find((r) => r.id === ruleId.value)
    if (existing) {
      name.value = existing.name
      action.value = existing.action
      conditions.value = [...existing.conditions]
    }
  } else {
    // Pre-fill from signalAction query param
    if (signalAction.value) {
      action.value = signalAction.value === 'allow' ? 'allow' : 'block'
    }
    // Pre-fill condition value from the quarantined signal's sender if available
    if (signalId.value) {
      const signal = quarantineStore.items.find((s) => s.id === signalId.value)
      if (signal) {
        conditions.value = [
          { field: 'from.address', operator: 'equals', value: signal.from.address },
        ]
        name.value = `${action.value === 'allow' ? 'Allow' : 'Block'} ${signal.from.address}`
        testInput.value.fromAddress = signal.from.address
      }
    }
  }
})

// Keep action in sync with signalAction when it changes (for new rules only)
watch(signalAction, (val) => {
  if (!isEditing.value && val) action.value = val === 'allow' ? 'allow' : 'block'
})
</script>

<template>
  <div>
    <header class="border-b border-ctp-surface0 bg-ctp-mantle px-4 py-3">
      <div class="flex items-center gap-3">
        <button class="text-sm text-ctp-subtext0 hover:text-ctp-text" @click="router.back()">
          ← Back
        </button>
        <div>
          <h1 class="text-lg font-semibold">{{ isEditing ? 'Edit rule' : 'New rule' }}</h1>
          <p v-if="signalId && !isEditing" class="mt-0.5 text-xs text-ctp-subtext0">
            Creating rule from quarantined signal — will be resolved after saving.
          </p>
        </div>
      </div>
    </header>

    <main class="mx-auto max-w-2xl px-4 py-6">
      <!-- Error -->
      <div
        v-if="rulesStore.error"
        class="mb-4 rounded-lg border border-ctp-red bg-ctp-red/10 px-4 py-3 text-sm text-ctp-red"
      >
        {{ rulesStore.error }}
        <button class="ml-2 underline" @click="rulesStore.clearError()">Dismiss</button>
      </div>

      <!-- Rule name -->
      <section class="mb-6">
        <label class="mb-1 block text-xs font-medium text-ctp-subtext0">Rule name</label>
        <input
          v-model="name"
          type="text"
          placeholder="e.g. Block marketing emails"
          class="w-full rounded-lg border border-ctp-surface1 bg-ctp-mantle px-3 py-2 text-sm text-ctp-text placeholder:text-ctp-subtext0 focus:border-ctp-mauve focus:outline-none"
        />
      </section>

      <!-- Conditions -->
      <section class="mb-6">
        <div class="mb-2 flex items-center justify-between">
          <label class="text-xs font-medium text-ctp-subtext0">Conditions (all must match)</label>
          <button class="text-xs text-ctp-mauve hover:underline" @click="addCondition">
            + Add condition
          </button>
        </div>
        <div class="space-y-2">
          <div
            v-for="(cond, idx) in conditions"
            :key="idx"
            class="flex items-center gap-2 rounded-lg border border-ctp-surface1 bg-ctp-mantle px-3 py-2"
          >
            <select
              :value="cond.field"
              class="rounded border border-ctp-surface1 bg-ctp-base px-2 py-1 text-xs text-ctp-text focus:border-ctp-mauve focus:outline-none"
              @change="
                updateCondition(idx, {
                  field: ($event.target as HTMLSelectElement).value as RuleConditionField,
                })
              "
            >
              <option v-for="f in FIELDS" :key="f.value" :value="f.value">{{ f.label }}</option>
            </select>

            <select
              :value="cond.operator"
              class="rounded border border-ctp-surface1 bg-ctp-base px-2 py-1 text-xs text-ctp-text focus:border-ctp-mauve focus:outline-none"
              @change="
                updateCondition(idx, {
                  operator: ($event.target as HTMLSelectElement).value as RuleConditionOperator,
                })
              "
            >
              <option v-for="op in OPERATORS" :key="op.value" :value="op.value">
                {{ op.label }}
              </option>
            </select>

            <input
              :value="cond.value"
              type="text"
              placeholder="value"
              class="min-w-0 flex-1 rounded border border-ctp-surface1 bg-ctp-base px-2 py-1 text-xs text-ctp-text placeholder:text-ctp-subtext0 focus:border-ctp-mauve focus:outline-none"
              :class="{
                'border-ctp-red':
                  testResult && !testResult.matchedConditions.includes(idx) && cond.value,
              }"
              @input="updateCondition(idx, { value: ($event.target as HTMLInputElement).value })"
            />

            <span
              v-if="testResult"
              class="text-xs"
              :class="
                testResult.matchedConditions.includes(idx) ? 'text-ctp-green' : 'text-ctp-surface2'
              "
            >
              {{ testResult.matchedConditions.includes(idx) ? '✓' : '✗' }}
            </span>

            <button
              v-if="conditions.length > 1"
              class="shrink-0 text-xs text-ctp-subtext0 hover:text-ctp-red"
              @click="removeCondition(idx)"
            >
              ✕
            </button>
          </div>
        </div>
      </section>

      <!-- Action -->
      <section class="mb-6">
        <label class="mb-2 block text-xs font-medium text-ctp-subtext0">Action</label>
        <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <button
            v-for="a in ACTIONS"
            :key="a.value"
            class="rounded-lg border px-3 py-2 text-left text-xs transition-colors"
            :class="
              action === a.value
                ? 'border-ctp-mauve bg-ctp-mauve/10 text-ctp-mauve'
                : 'border-ctp-surface1 text-ctp-subtext1 hover:border-ctp-surface2 hover:text-ctp-text'
            "
            @click="action = a.value"
          >
            <p class="font-medium">{{ a.label }}</p>
            <p class="text-ctp-subtext0">{{ a.description }}</p>
          </button>
        </div>
      </section>

      <!-- Rule tester -->
      <section class="mb-6 rounded-lg border border-ctp-surface1 bg-ctp-mantle p-4">
        <h3 class="mb-3 text-xs font-medium text-ctp-subtext1">Test this rule</h3>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="mb-1 block text-xs text-ctp-subtext0">Sender address</label>
            <input
              v-model="testInput.fromAddress"
              type="email"
              placeholder="user@example.com"
              class="w-full rounded border border-ctp-surface1 bg-ctp-base px-2 py-1.5 text-xs text-ctp-text placeholder:text-ctp-subtext0 focus:border-ctp-mauve focus:outline-none"
            />
          </div>
          <div>
            <label class="mb-1 block text-xs text-ctp-subtext0">Subject</label>
            <input
              v-model="testInput.subject"
              type="text"
              placeholder="Email subject"
              class="w-full rounded border border-ctp-surface1 bg-ctp-base px-2 py-1.5 text-xs text-ctp-text placeholder:text-ctp-subtext0 focus:border-ctp-mauve focus:outline-none"
            />
          </div>
        </div>
        <div class="mt-3 flex items-center gap-3">
          <button
            class="rounded bg-ctp-surface1 px-3 py-1.5 text-xs font-medium text-ctp-text hover:bg-ctp-surface2"
            @click="runTest"
          >
            Run test
          </button>
          <span
            v-if="testResult !== null"
            class="text-xs font-medium"
            :class="testResult.matches ? 'text-ctp-green' : 'text-ctp-subtext0'"
          >
            {{ testResult.matches ? '✓ Rule matches this email' : '✗ Rule does not match' }}
          </span>
        </div>
      </section>

      <!-- Save -->
      <div class="flex items-center gap-3">
        <button
          :disabled="!canSave || rulesStore.savePending"
          class="rounded-lg bg-ctp-mauve px-4 py-2 text-sm font-medium text-ctp-base hover:opacity-90 disabled:opacity-50"
          @click="save"
        >
          {{ rulesStore.savePending ? 'Saving…' : isEditing ? 'Save changes' : 'Create rule' }}
        </button>
        <button class="text-sm text-ctp-subtext0 hover:text-ctp-text" @click="router.back()">
          Cancel
        </button>
      </div>
    </main>
  </div>
</template>

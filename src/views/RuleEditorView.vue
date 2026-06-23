<script setup lang="ts">
import { ref, computed, onMounted, watch, watchEffect } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAccountStore } from '@/stores/account'
import { useRulesStore } from '@/stores/rules'
import { useLabelsStore } from '@/stores/labels'
import { useQuarantineStore } from '@/stores/quarantine'
import { useTemplatesStore } from '@/stores/templates'
import type {
  ConditionField,
  ConditionGroup,
  ConditionLeaf,
  ConditionOperator,
  RuleAction,
  RuleActionType,
} from '@/types/server'
import {
  defaultLeaf,
  evalLogic,
  FIELDS,
  logicToGroups,
  OPERATORS,
  serializeCondition,
} from '@/lib/ruleLogic'
import AsyncButton from '@/components/ui/AsyncButton.vue'
import { useJsAutocomplete } from '@/composables/useJsAutocomplete'

const route = useRoute()
const router = useRouter()
const accountStore = useAccountStore()
const rulesStore = useRulesStore()
const labelsStore = useLabelsStore()
const quarantineStore = useQuarantineStore()
const templatesStore = useTemplatesStore()

const jsAc = useJsAutocomplete()

const signalId = computed(() => (route.query.signalId as string) ?? null)
const signalAction = computed(
  () => (route.query.action as 'allow' | 'block_hidden' | 'block_reject') ?? null,
)
const ruleId = computed(() => (route.params.id as string) ?? null)
const isEditing = computed(() => !!ruleId.value)

const loaded = ref(false)

// ─── Form state ───────────────────────────────────────────────────────────────

const name = ref('')
const status = ref<'enabled' | 'disabled'>('enabled')
const conditionType = ref<'json_logic' | 'js'>('json_logic')
const groups = ref<ConditionGroup[]>([{ mode: 'and', conditions: [defaultLeaf()] }])
const jsCondition = ref('')
const actions = ref<RuleAction[]>([{ type: 'block_hidden' }])

// ─── Condition builder helpers ────────────────────────────────────────────────

function addGroup() {
  groups.value = [...groups.value, { mode: 'and', conditions: [defaultLeaf()] }]
}

function removeGroup(gi: number) {
  groups.value = groups.value.filter((_, i) => i !== gi)
}

function addCondition(gi: number) {
  groups.value = groups.value.map((grp, i) =>
    i === gi ? { ...grp, conditions: [...grp.conditions, defaultLeaf()] } : grp,
  )
}

function removeCondition(gi: number, ci: number) {
  groups.value = groups.value.map((grp, i) =>
    i === gi ? { ...grp, conditions: grp.conditions.filter((_, j) => j !== ci) } : grp,
  )
}

function updateCondition(gi: number, ci: number, patch: Partial<ConditionLeaf>) {
  groups.value = groups.value.map((grp, i) =>
    i === gi
      ? { ...grp, conditions: grp.conditions.map((c, j) => (j === ci ? { ...c, ...patch } : c)) }
      : grp,
  )
}

function setGroupMode(gi: number, mode: 'and' | 'or') {
  groups.value = groups.value.map((grp, i) => (i === gi ? { ...grp, mode } : grp))
}

// ─── Visual → JS one-way conversion ──────────────────────────────────────────

function leafToJs(leaf: ConditionLeaf): string {
  const fieldPath = leaf.field
  const val = leaf.field === 'signal.spamScore' ? leaf.value : `"${leaf.value}"`

  switch (leaf.operator) {
    case 'equals': return `${fieldPath} === ${val}`
    case 'not_equals': return `${fieldPath} !== ${val}`
    case 'contains': return `${fieldPath}.includes(${val})`
    case 'not_contains': return `!${fieldPath}.includes(${val})`
    case 'starts_with': return `${fieldPath}.startsWith(${val})`
    case 'ends_with': return `${fieldPath}.endsWith(${val})`
    case 'greater_than': return `${fieldPath} > ${leaf.value}`
    case 'less_than': return `${fieldPath} < ${leaf.value}`
  }
}

function groupToJs(group: ConditionGroup): string {
  const parts = group.conditions.map(leafToJs)
  if (parts.length === 1) return parts[0]
  const joiner = group.mode === 'and' ? ' && ' : ' || '
  return `(${parts.join(joiner)})`
}

function visualToJs(grps: ConditionGroup[]): string {
  const parts = grps.map(groupToJs)
  const expr = parts.length === 1 ? parts[0] : parts.join(' && ')
  return `return ${expr};`
}

watch(conditionType, (newType, oldType) => {
  if (newType === 'js' && oldType === 'json_logic') {
    const hasContent = groups.value.some((g) => g.conditions.some((c) => c.value.trim()))
    if (hasContent && !jsCondition.value.trim()) {
      jsCondition.value = visualToJs(groups.value)
    }
  }
})

// ─── Rule tester ──────────────────────────────────────────────────────────────

const testInput = ref({ fromAddress: '', subject: '', workflow: '', spamScore: '' })
const testResult = ref<boolean | null>(null)

function runTest() {
  const data = {
    signal: {
      from: {
        address: testInput.value.fromAddress,
        domain: testInput.value.fromAddress.split('@')[1] ?? '',
      },
      subject: testInput.value.subject,
      workflow: testInput.value.workflow,
      spamScore: testInput.value.spamScore ? Number(testInput.value.spamScore) : 0,
    },
    arc: { labels: [], urgency: 'normal', status: 'active' },
  }
  try {
    testResult.value = evalLogic(
      JSON.parse(serializeCondition(groups.value)) as unknown,
      data as Record<string, unknown>,
    )
  } catch {
    testResult.value = false
  }
}

const testerOpen = ref(false)

// Auto-run test whenever conditions or test inputs change (while tester is open)
watchEffect(() => {
  if (!testerOpen.value) return
  // Touch reactive deps to trigger re-run
  const _g = JSON.stringify(groups.value)
  const _t = JSON.stringify(testInput.value)
  void _g
  void _t
  // Only run if there's any test input
  if (testInput.value.fromAddress || testInput.value.subject || testInput.value.workflow || testInput.value.spamScore) {
    runTest()
  }
})

// ─── Actions editor ───────────────────────────────────────────────────────────

const ACTION_COLORS: Partial<Record<RuleActionType, string>> = {
  block_hidden: 'text-ctp-red bg-ctp-red/10',
  block_reject: 'text-ctp-red bg-ctp-red/10',
  quarantine: 'text-ctp-peach bg-ctp-peach/10',
  quarantine_hidden: 'text-ctp-peach bg-ctp-peach/10',
  archive: 'text-ctp-subtext0 bg-ctp-surface1',
  assign_label: 'text-ctp-blue bg-ctp-blue/10',
  approve_sender: 'text-ctp-green bg-ctp-green/10',
  forward: 'text-ctp-sapphire bg-ctp-sapphire/10',
  auto_draft: 'text-ctp-mauve bg-ctp-mauve/10',
  webhook: 'text-ctp-mauve bg-ctp-mauve/10',
  assign_workflow: 'text-ctp-teal bg-ctp-teal/10',
  set_urgency: 'text-ctp-yellow bg-ctp-yellow/10',
  suppress_notification: 'text-ctp-lavender bg-ctp-lavender/10',
  pong: 'text-ctp-green bg-ctp-green/10',
  forwardCalendarInvite: 'text-ctp-sapphire bg-ctp-sapphire/10',
}

interface ActionMeta {
  type: RuleActionType
  label: string
  description: string
}

const ACTION_META: ActionMeta[] = [
  { type: 'block_hidden', label: 'Block (hidden)', description: 'Silently discard — sender not notified' },
  { type: 'block_reject', label: 'Block (reject)', description: 'Discard and bounce to sender' },
  { type: 'quarantine', label: 'Quarantine', description: 'Hold for manual review' },
  {
    type: 'quarantine_hidden',
    label: 'Quarantine (hidden)',
    description: 'Hold without user notification',
  },
  { type: 'archive', label: 'Archive', description: 'Archive the arc immediately' },
  { type: 'assign_label', label: 'Assign label', description: 'Tag with a label' },
  { type: 'assign_workflow', label: 'Assign workflow', description: 'Override workflow' },
  { type: 'set_urgency', label: 'Set urgency', description: 'Override urgency level' },
  { type: 'forward', label: 'Forward', description: 'Forward to another address' },
  { type: 'approve_sender', label: 'Approve sender', description: 'Whitelist the sender' },
  {
    type: 'suppress_notification',
    label: 'Suppress notification',
    description: 'Deliver without notification',
  },
  { type: 'auto_draft', label: 'Auto draft', description: 'Pre-draft a reply' },
  { type: 'pong', label: 'Pong', description: 'Send an acknowledgement reply' },
  { type: 'webhook', label: 'Webhook', description: 'POST signal data to an external URL' },
  { type: 'forwardCalendarInvite', label: 'Forward calendar invite', description: 'Forward calendar invites to another address' },
]

const WORKFLOW_OPTIONS = [
  'auth',
  'conversation',
  'crm',
  'package',
  'travel',
  'scheduling',
  'payments',
  'alert',
  'content',
  'status',
  'healthcare',
  'job',
  'support',
  'test',
]
const URGENCY_OPTIONS = ['critical', 'high', 'normal', 'low', 'silent']

const webhookTestResult = ref<{ ok: boolean; status: number; error?: string } | null>(null)

async function testWebhook(url: string) {
  webhookTestResult.value = null
  const key = crypto.randomUUID().replace(/-/g, '').slice(0, 12)
  const payload = { [key]: `This test webhook request was generated by ${accountStore.account?.accountId}` }
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    webhookTestResult.value = { ok: res.ok, status: res.status }
  } catch {
    webhookTestResult.value = { ok: false, status: 0, error: 'Request blocked — your endpoint may need CORS headers, or it will work when called from our servers' }
  }
}

const addingAction = ref(false)
const actionTypeToAdd = ref<RuleActionType>('block_hidden')

function addAction() {
  actions.value = [...actions.value, { type: actionTypeToAdd.value }]
  addingAction.value = false
}

function removeAction(idx: number) {
  actions.value = actions.value.filter((_, i) => i !== idx)
}

function updateAction(idx: number, patch: Partial<RuleAction>) {
  actions.value = actions.value.map((a, i) => (i === idx ? { ...a, ...patch } : a))
}

function actionLabel(type: RuleActionType): string {
  return ACTION_META.find((m) => m.type === type)?.label ?? type
}

// ─── Save ─────────────────────────────────────────────────────────────────────

const canSave = computed(
  () =>
    name.value.trim().length > 0 &&
    actions.value.length > 0 &&
    (conditionType.value === 'js' || groups.value.every((g) => g.conditions.every((c) => c.value.trim().length > 0))),
)

async function save() {
  if (!canSave.value) return
  const body = {
    name: name.value.trim(),
    status: status.value,
    conditionType: conditionType.value,
    condition: conditionType.value === 'js' ? jsCondition.value : serializeCondition(groups.value),
    actions: actions.value,
  }

  const saved = isEditing.value
    ? await rulesStore.updateRule(ruleId.value!, body)
    : await rulesStore.createRule(body)

  if (saved.isErr()) return

  if (signalId.value && signalAction.value) {
    if (signalAction.value === 'allow') {
      await quarantineStore.allow(signalId.value)
    } else {
      await quarantineStore.reject(signalId.value)
    }
    void router.push('/quarantine')
  } else {
    void router.push('/rules')
  }
}

// ─── Load ─────────────────────────────────────────────────────────────────────

onMounted(async () => {
  await Promise.all([labelsStore.fetchLabels(), templatesStore.fetchTemplates()])

  if (isEditing.value) {
    if (rulesStore.items.length === 0) await rulesStore.fetchRules()
    const existing = rulesStore.items.find((r) => r.ruleId === ruleId.value)
    if (existing) {
      name.value = existing.name
      status.value = existing.status
      conditionType.value = existing.conditionType ?? 'json_logic'
      actions.value = [...existing.actions]
      if (conditionType.value === 'js') {
        jsCondition.value = existing.condition ?? ''
      } else {
        groups.value = logicToGroups(existing.condition ?? '')
      }
    }
  } else {
    if (signalAction.value) {
      actions.value = [{ type: signalAction.value === 'allow' ? 'approve_sender' : 'block_hidden' }]
    }
    if (signalId.value) {
      const signal = [...quarantineStore.quarantineVisible, ...quarantineStore.quarantineHidden].find((s) => s.signalId === signalId.value)
      if (signal && signal.type === 'email' && 'from' in signal.data) {
        const fromAddr = signal.data.from.address
        groups.value = [
          {
            mode: 'and',
            conditions: [
              { field: 'signal.from.address', operator: 'equals', value: fromAddr },
            ],
          },
        ]
        name.value = `${signalAction.value === 'allow' ? 'Allow' : 'Block'} ${fromAddr}`
        testInput.value.fromAddress = fromAddr
      }
    }
  }

  loaded.value = true
})

watch(signalAction, (val) => {
  if (!isEditing.value && val) {
    actions.value = [{ type: val === 'allow' ? 'approve_sender' : 'block_hidden' }]
  }
})
</script>

<template>
  <div>
    <header class="border-b border-ctp-surface0 bg-ctp-mantle px-4 py-3">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <button class="text-sm text-ctp-subtext0 hover:text-ctp-text" @click="router.back()">
            ← Back
          </button>
          <div>
            <h1 class="hidden text-lg font-semibold sm:block">{{ isEditing ? 'Edit rule' : 'New rule' }}</h1>
            <p v-if="signalId && !isEditing" class="mt-0.5 text-xs text-ctp-subtext0">
              Creating rule from quarantined signal — will be resolved after saving.
            </p>
          </div>
        </div>
      </div>
    </header>

    <main class="mx-auto max-w-2xl px-4 py-6">
      <!-- Loading skeleton -->
      <div v-if="!loaded" role="status" aria-label="Loading rule…" class="animate-pulse space-y-6">
        <div class="space-y-2">
          <div class="h-3 w-20 rounded bg-ctp-surface1" />
          <div class="h-9 w-full rounded-lg bg-ctp-surface1" />
        </div>
        <div class="h-16 w-full rounded-lg bg-ctp-surface1" />
        <div class="space-y-2">
          <div class="h-3 w-24 rounded bg-ctp-surface1" />
          <div class="h-32 w-full rounded-lg bg-ctp-surface1" />
        </div>
        <div class="space-y-2">
          <div class="h-3 w-16 rounded bg-ctp-surface1" />
          <div class="h-12 w-full rounded-lg bg-ctp-surface1" />
        </div>
        <div class="h-9 w-32 rounded-lg bg-ctp-surface1" />
      </div>

      <template v-else>
      <!-- Error -->
      <div
        v-if="rulesStore.error"
        role="alert"
        class="mb-4 rounded-lg border border-ctp-red bg-ctp-red/10 px-4 py-3 text-sm text-ctp-red"
      >
        {{ rulesStore.error }}
        <button class="ml-2 underline" @click="rulesStore.clearError()">Dismiss</button>
      </div>

      <!-- Name -->
      <section class="mb-6">
        <label for="rule-name" class="mb-1 block text-xs font-medium text-ctp-subtext0">Rule name</label>
        <input
          id="rule-name"
          v-model="name"
          type="text"
          placeholder="e.g. Block marketing emails"
          class="w-full rounded-lg border border-ctp-surface1 bg-ctp-mantle px-3 py-2 text-sm text-ctp-text placeholder:text-ctp-subtext0 focus:border-ctp-mauve focus:outline-none"
        />
      </section>

      <!-- Status toggle -->
      <section class="mb-6">
        <div class="flex items-center justify-between rounded-lg border border-ctp-surface1 bg-ctp-mantle px-4 py-3">
          <div>
            <span class="text-sm font-medium text-ctp-text">Rule status</span>
            <p class="text-xs text-ctp-subtext0">{{ status === 'enabled' ? 'This rule is actively processing emails' : 'This rule is paused and will not trigger' }}</p>
          </div>
          <button
            role="switch"
            :aria-checked="status === 'enabled'"
            class="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors"
            :class="
              status === 'enabled'
                ? 'bg-ctp-green/15 text-ctp-green'
                : 'bg-ctp-surface1 text-ctp-subtext0'
            "
            @click="status = status === 'enabled' ? 'disabled' : 'enabled'"
          >
            <span
              class="inline-block h-1.5 w-1.5 rounded-full"
              :class="status === 'enabled' ? 'bg-ctp-green' : 'bg-ctp-subtext0'"
            />
            {{ status === 'enabled' ? 'Enabled' : 'Disabled' }}
          </button>
        </div>
      </section>

      <!-- Conditions -->
      <section class="mb-6">
        <div class="mb-2 flex items-center justify-between">
          <span class="text-xs font-medium text-ctp-subtext0">Conditions</span>
          <div class="flex items-center gap-3">
            <!-- conditionType toggle -->
            <div class="flex items-center gap-1 rounded-full bg-ctp-surface0 p-0.5">
              <button
                :aria-pressed="conditionType === 'json_logic'"
                class="rounded-full px-2.5 py-0.5 text-xs transition-colors"
                :class="
                  conditionType === 'json_logic'
                    ? 'bg-ctp-surface2 text-ctp-text'
                    : 'text-ctp-subtext0 hover:text-ctp-text'
                "
                @click="conditionType = 'json_logic'"
              >
                Visual
              </button>
              <button
                :aria-pressed="conditionType === 'js'"
                class="rounded-full px-2.5 py-0.5 text-xs transition-colors"
                :class="
                  conditionType === 'js'
                    ? 'bg-ctp-surface2 text-ctp-text'
                    : 'text-ctp-subtext0 hover:text-ctp-text'
                "
                @click="conditionType = 'js'"
              >
                JavaScript
              </button>
            </div>
          </div>
        </div>

        <!-- Visual builder (json_logic) -->
        <div v-if="conditionType === 'json_logic'" class="space-y-3">
          <div
            v-for="(group, gi) in groups"
            :key="gi"
            class="rounded-lg border border-ctp-surface1 bg-ctp-mantle p-3"
          >
            <!-- AND / OR toggle -->
            <div class="mb-2 flex items-center justify-between">
              <div class="flex items-center gap-1 rounded-full bg-ctp-surface0 p-0.5">
                <button
                  :aria-pressed="group.mode === 'and'"
                  class="rounded-full px-2.5 py-0.5 text-xs transition-colors"
                  :class="
                    group.mode === 'and'
                      ? 'bg-ctp-surface2 text-ctp-text'
                      : 'text-ctp-subtext0 hover:text-ctp-text'
                  "
                  @click="setGroupMode(gi, 'and')"
                >
                  AND
                </button>
                <button
                  :aria-pressed="group.mode === 'or'"
                  class="rounded-full px-2.5 py-0.5 text-xs transition-colors"
                  :class="
                    group.mode === 'or'
                      ? 'bg-ctp-surface2 text-ctp-text'
                      : 'text-ctp-subtext0 hover:text-ctp-text'
                  "
                  @click="setGroupMode(gi, 'or')"
                >
                  OR
                </button>
              </div>
              <div class="flex items-center gap-3">
                <p class="text-xs text-ctp-subtext0">
                  {{ group.mode === 'and' ? 'All conditions must match' : 'Any one condition is enough' }}
                </p>
                <button
                  v-if="groups.length > 1"
                  class="text-xs text-ctp-subtext0 hover:text-ctp-red"
                  @click="removeGroup(gi)"
                >
                  Remove group
                </button>
              </div>
            </div>

            <!-- Condition rows -->
            <div class="space-y-2">
              <div
                v-for="(cond, ci) in group.conditions"
                :key="ci"
                class="flex flex-wrap items-center gap-2"
              >
                <select
                  :value="cond.field"
                  :aria-label="`Condition ${ci + 1} field`"
                  class="rounded border border-ctp-surface1 bg-ctp-base px-2 py-1.5 text-xs text-ctp-text focus:border-ctp-mauve focus:outline-none"
                  @change="
                    updateCondition(gi, ci, {
                      field: ($event.target as HTMLSelectElement).value as ConditionField,
                    })
                  "
                >
                  <option v-for="f in FIELDS" :key="f.value" :value="f.value">
                    {{ f.label }}
                  </option>
                </select>

                <select
                  :value="cond.operator"
                  :aria-label="`Condition ${ci + 1} operator`"
                  class="rounded border border-ctp-surface1 bg-ctp-base px-2 py-1.5 text-xs text-ctp-text focus:border-ctp-mauve focus:outline-none"
                  @change="
                    updateCondition(gi, ci, {
                      operator: ($event.target as HTMLSelectElement).value as ConditionOperator,
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
                  :aria-label="`Condition ${ci + 1} value`"
                  placeholder="value"
                  class="min-w-0 flex-1 rounded border border-ctp-surface1 bg-ctp-base px-2 py-1.5 text-xs text-ctp-text placeholder:text-ctp-subtext0 focus:border-ctp-mauve focus:outline-none"
                  @input="
                    updateCondition(gi, ci, { value: ($event.target as HTMLInputElement).value })
                  "
                />

                <button
                  v-if="group.conditions.length > 1"
                  class="shrink-0 text-xs text-ctp-subtext0 hover:text-ctp-red"
                  @click="removeCondition(gi, ci)"
                >
                  ✕
                </button>
              </div>
            </div>

            <button class="mt-2 text-xs text-ctp-mauve hover:underline" @click="addCondition(gi)">
              + Add condition
            </button>
          </div>

          <!-- Add group button (below all condition groups) -->
          <div class="flex justify-center pt-1">
            <button
              class="rounded-lg border border-dashed border-ctp-surface2 px-6 py-2.5 text-sm font-medium text-ctp-mauve transition-colors hover:border-ctp-mauve hover:bg-ctp-mauve/5"
              @click="addGroup"
            >
              + Add condition group
            </button>
          </div>
        </div>

        <!-- JavaScript editor (js) -->
        <div v-else class="relative rounded-lg border border-ctp-surface1 bg-ctp-mantle p-3">
          <label for="js-condition" class="mb-1 block text-xs text-ctp-subtext0">
            JavaScript condition function body — receives <code class="text-ctp-mauve">signal</code> and <code class="text-ctp-mauve">arc</code>, return <code class="text-ctp-mauve">true</code> to match.
          </label>
          <textarea
            id="js-condition"
            v-model="jsCondition"
            rows="8"
            spellcheck="false"
            placeholder="// Example: return signal.from.address.endsWith('@example.com');"
            class="w-full resize-y rounded border border-ctp-surface1 bg-ctp-base px-3 py-2 font-mono text-xs text-ctp-text placeholder:text-ctp-subtext0 focus:border-ctp-mauve focus:outline-none"
            @input="jsAc.onInput"
            @keydown="jsAc.onKeydown"
            @blur="jsAc.close"
          />

          <!-- Autocomplete popup -->
          <div
            v-if="jsAc.showPopup.value"
            class="fixed z-50 min-w-[240px] overflow-hidden rounded-lg border border-ctp-surface1 bg-ctp-mantle shadow-lg"
            :style="{ left: jsAc.popupLeft.value + 'px', top: jsAc.popupTop.value + 'px' }"
          >
            <button
              v-for="(item, idx) in jsAc.filtered.value"
              :key="item.path"
              type="button"
              class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors"
              :class="idx === jsAc.selectedIdx.value ? 'bg-ctp-surface1 text-ctp-text' : 'text-ctp-subtext1 hover:bg-ctp-surface0'"
              @mousedown.prevent="jsAc.accept(item)"
            >
              <span class="shrink-0 rounded bg-ctp-surface0 px-1.5 py-0.5 font-mono text-ctp-mauve">{{ item.type }}</span>
              <span class="flex-1 font-mono">{{ item.label }}</span>
              <span v-if="item.example" class="shrink-0 text-ctp-subtext0">{{ item.example }}</span>
            </button>
          </div>

          <!-- Property reference hint -->
          <details class="mt-2">
            <summary class="cursor-pointer text-xs text-ctp-subtext0 hover:text-ctp-text">Available properties (type <code class="text-ctp-mauve">signal.</code> or <code class="text-ctp-mauve">arc.</code> for autocomplete)</summary>
            <div class="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <div class="font-mono text-ctp-mauve">signal.from.address</div><div class="text-ctp-subtext0">Sender email</div>
              <div class="font-mono text-ctp-mauve">signal.from.domain</div><div class="text-ctp-subtext0">Sender domain</div>
              <div class="font-mono text-ctp-mauve">signal.subject</div><div class="text-ctp-subtext0">Email subject</div>
              <div class="font-mono text-ctp-mauve">signal.workflow</div><div class="text-ctp-subtext0">Detected workflow</div>
              <div class="font-mono text-ctp-mauve">signal.spamScore</div><div class="text-ctp-subtext0">0–10 spam score</div>
              <div class="font-mono text-ctp-mauve">arc.workflow</div><div class="text-ctp-subtext0">Arc workflow</div>
              <div class="font-mono text-ctp-mauve">arc.urgency</div><div class="text-ctp-subtext0">critical/high/normal/low/silent</div>
              <div class="font-mono text-ctp-mauve">arc.labels</div><div class="text-ctp-subtext0">Applied label IDs (array)</div>
              <div class="font-mono text-ctp-mauve">arc.status</div><div class="text-ctp-subtext0">active/archived/deleted</div>
            </div>
          </details>
        </div>
      </section>

      <!-- Actions -->
      <section class="mb-6">
        <span class="mb-2 block text-xs font-medium text-ctp-subtext0">Actions</span>

        <div class="space-y-2">
          <div
            v-for="(act, idx) in actions"
            :key="idx"
            class="flex flex-wrap items-center gap-3 rounded-lg border border-ctp-surface1 bg-ctp-mantle px-3 py-2"
          >
            <span
              class="rounded-full px-2.5 py-0.5 text-xs font-medium"
              :class="ACTION_COLORS[act.type] ?? 'text-ctp-subtext0 bg-ctp-surface1'"
            >
              {{ actionLabel(act.type) }}
            </span>

            <template v-if="act.type === 'assign_label'">
              <select
                :value="act.value ?? ''"
                aria-label="Label"
                class="rounded border border-ctp-surface1 bg-ctp-base px-2 py-0.5 text-xs text-ctp-text focus:border-ctp-mauve focus:outline-none"
                @change="updateAction(idx, { value: ($event.target as HTMLSelectElement).value })"
              >
                <option value="">Pick label…</option>
                <option v-for="l in labelsStore.items" :key="l.label" :value="l.label">
                  {{ l.name }}
                </option>
              </select>
            </template>

            <template v-else-if="act.type === 'assign_workflow'">
              <select
                :value="act.value ?? ''"
                aria-label="Workflow"
                class="rounded border border-ctp-surface1 bg-ctp-base px-2 py-0.5 text-xs text-ctp-text focus:border-ctp-mauve focus:outline-none"
                @change="
                  updateAction(idx, {
                    value: ($event.target as HTMLSelectElement).value,
                  })
                "
              >
                <option value="">Pick workflow…</option>
                <option v-for="w in WORKFLOW_OPTIONS" :key="w" :value="w">{{ w }}</option>
              </select>
            </template>

            <template v-else-if="act.type === 'set_urgency'">
              <select
                :value="act.value ?? ''"
                aria-label="Urgency level"
                class="rounded border border-ctp-surface1 bg-ctp-base px-2 py-0.5 text-xs text-ctp-text focus:border-ctp-mauve focus:outline-none"
                @change="
                  updateAction(idx, {
                    value: ($event.target as HTMLSelectElement).value,
                  })
                "
              >
                <option value="">Pick urgency…</option>
                <option v-for="u in URGENCY_OPTIONS" :key="u" :value="u">{{ u }}</option>
              </select>
            </template>

            <template v-else-if="act.type === 'forward' || act.type === 'forwardCalendarInvite'">
              <input
                :value="act.value ?? ''"
                type="email"
                aria-label="Forward to address"
                placeholder="forward@example.com"
                class="flex-1 rounded border border-ctp-surface1 bg-ctp-base px-2 py-0.5 text-xs text-ctp-text placeholder:text-ctp-subtext0 focus:border-ctp-mauve focus:outline-none"
                @input="updateAction(idx, { value: ($event.target as HTMLInputElement).value })"
              />
            </template>

            <template v-else-if="act.type === 'auto_draft'">
              <select
                :value="act.value ?? ''"
                aria-label="Template"
                class="flex-1 rounded border border-ctp-surface1 bg-ctp-base px-2 py-0.5 text-xs text-ctp-text focus:border-ctp-mauve focus:outline-none"
                @change="updateAction(idx, { value: ($event.target as HTMLSelectElement).value || undefined })"
              >
                <option value="">— Select template —</option>
                <option v-for="tpl in templatesStore.templates" :key="tpl.templateId" :value="tpl.templateId">
                  {{ tpl.name }}
                </option>
              </select>
              <RouterLink
                to="/templates"
                class="shrink-0 text-xs text-ctp-mauve hover:opacity-80"
                title="Manage templates"
              >
                Manage
              </RouterLink>
            </template>

            <template v-else-if="act.type === 'webhook'">
              <input
                :value="act.value ?? ''"
                type="url"
                aria-label="Webhook URL"
                placeholder="https://example.com/webhook"
                class="flex-1 rounded border border-ctp-surface1 bg-ctp-base px-2 py-0.5 text-xs text-ctp-text placeholder:text-ctp-subtext0 focus:border-ctp-mauve focus:outline-none"
                @input="updateAction(idx, { value: ($event.target as HTMLInputElement).value })"
              />
              <AsyncButton
                :action="() => testWebhook(act.value ?? '')"
                :disabled="!act.value"
                class="shrink-0 rounded border border-ctp-surface1 px-2.5 py-0.5 text-xs font-medium text-ctp-text hover:border-ctp-mauve"
              >
                Test
              </AsyncButton>
              <span v-if="webhookTestResult?.error" class="basis-full text-xs text-ctp-red">
                ✗ {{ webhookTestResult.error }}
              </span>
              <span v-else-if="webhookTestResult" class="text-xs" :class="webhookTestResult.ok ? 'text-ctp-green' : 'text-ctp-red'">
                {{ webhookTestResult.ok ? '✓ 200 OK' : `✗ ${webhookTestResult.status}` }}
              </span>
            </template>

            <button
              class="ml-auto text-xs text-ctp-subtext0 hover:text-ctp-red"
              @click="removeAction(idx)"
            >
              ✕
            </button>
          </div>
        </div>

        <!-- Add action picker -->
        <div v-if="addingAction" class="mt-2 flex items-center gap-2">
          <select
            v-model="actionTypeToAdd"
            aria-label="Action type to add"
            class="flex-1 rounded border border-ctp-surface1 bg-ctp-mantle px-2 py-1.5 text-xs text-ctp-text focus:border-ctp-mauve focus:outline-none"
          >
            <option v-for="m in ACTION_META" :key="m.type" :value="m.type">
              {{ m.label }} — {{ m.description }}
            </option>
          </select>
          <button
            class="rounded bg-ctp-mauve px-3 py-1.5 text-xs font-medium text-ctp-base hover:opacity-90"
            @click="addAction"
          >
            Add
          </button>
          <button
            class="text-xs text-ctp-subtext0 hover:text-ctp-text"
            @click="addingAction = false"
          >
            Cancel
          </button>
        </div>
        <button
          v-else
          class="mt-4 flex w-full justify-center rounded-lg border border-dashed border-ctp-surface2 px-6 py-2.5 text-sm font-medium text-ctp-mauve transition-colors hover:border-ctp-mauve hover:bg-ctp-mauve/5"
          @click="addingAction = true"
        >
          + Add action
        </button>
      </section>

      <!-- Rule tester (only for visual builder) — collapsible accordion -->
      <section v-if="conditionType === 'json_logic'" class="mb-6">
        <details class="rounded-lg border border-ctp-surface1 bg-ctp-mantle" @toggle="(e: Event) => { testerOpen = (e.target as HTMLDetailsElement).open }">
          <summary class="cursor-pointer select-none px-4 py-3 text-xs font-medium text-ctp-subtext1 hover:text-ctp-text">
            Rule tester
            <span
              v-if="testResult !== null"
              class="ml-2 text-xs font-medium"
              :class="testResult ? 'text-ctp-green' : 'text-ctp-subtext0'"
            >
              {{ testResult ? '✓ Match' : '✗ No match' }}
            </span>
          </summary>
          <div class="border-t border-ctp-surface0 px-4 py-3">
            <div class="grid gap-3 sm:grid-cols-2">
              <div>
                <label for="test-from" class="mb-1 block text-xs text-ctp-subtext0">Sender address</label>
                <input
                  id="test-from"
                  v-model="testInput.fromAddress"
                  type="email"
                  placeholder="user@example.com"
                  class="w-full rounded border border-ctp-surface1 bg-ctp-base px-2 py-1.5 text-xs text-ctp-text placeholder:text-ctp-subtext0 focus:border-ctp-mauve focus:outline-none"
                />
              </div>
              <div>
                <label for="test-subject" class="mb-1 block text-xs text-ctp-subtext0">Subject</label>
                <input
                  id="test-subject"
                  v-model="testInput.subject"
                  type="text"
                  placeholder="Email subject"
                  class="w-full rounded border border-ctp-surface1 bg-ctp-base px-2 py-1.5 text-xs text-ctp-text placeholder:text-ctp-subtext0 focus:border-ctp-mauve focus:outline-none"
                />
              </div>
              <div>
                <label for="test-workflow" class="mb-1 block text-xs text-ctp-subtext0">Workflow</label>
                <input
                  id="test-workflow"
                  v-model="testInput.workflow"
                  type="text"
                  placeholder="e.g. conversation"
                  class="w-full rounded border border-ctp-surface1 bg-ctp-base px-2 py-1.5 text-xs text-ctp-text placeholder:text-ctp-subtext0 focus:border-ctp-mauve focus:outline-none"
                />
              </div>
              <div>
                <label for="test-spam" class="mb-1 block text-xs text-ctp-subtext0">Spam score (0–10)</label>
                <input
                  id="test-spam"
                  v-model="testInput.spamScore"
                  type="number"
                  min="0"
                  max="10"
                  placeholder="0"
                  class="w-full rounded border border-ctp-surface1 bg-ctp-base px-2 py-1.5 text-xs text-ctp-text placeholder:text-ctp-subtext0 focus:border-ctp-mauve focus:outline-none"
                />
              </div>
            </div>
            <div v-if="testResult !== null" class="mt-3">
              <span
                class="text-xs font-medium"
                :class="testResult ? 'text-ctp-green' : 'text-ctp-subtext0'"
              >
                {{ testResult ? '✓ Rule matches this email' : '✗ Rule does not match' }}
              </span>
            </div>
          </div>
        </details>
      </section>

      <!-- Save -->
      <div class="flex items-center gap-3">
        <AsyncButton
          :action="save"
          :disabled="!canSave"
          class="rounded-lg bg-ctp-mauve px-4 py-2 text-sm font-medium text-ctp-base hover:opacity-90"
        >
          {{ isEditing ? 'Save changes' : 'Create rule' }}
        </AsyncButton>
        <button class="text-sm text-ctp-subtext0 hover:text-ctp-text" @click="router.back()">
          Cancel
        </button>
      </div>
      </template>
    </main>
  </div>
</template>

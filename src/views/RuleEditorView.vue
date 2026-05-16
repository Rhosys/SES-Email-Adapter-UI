<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
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

const route = useRoute()
const router = useRouter()
const accountStore = useAccountStore()
const rulesStore = useRulesStore()
const labelsStore = useLabelsStore()
const quarantineStore = useQuarantineStore()
const templatesStore = useTemplatesStore()

const signalId = computed(() => (route.query.signalId as string) ?? null)
const signalAction = computed(
  () => (route.query.action as 'allow' | 'block_hidden' | 'block_reject') ?? null,
)
const ruleId = computed(() => (route.params.id as string) ?? null)
const isEditing = computed(() => !!ruleId.value)

// ─── Form state ───────────────────────────────────────────────────────────────

const name = ref('')
const status = ref<'enabled' | 'disabled'>('enabled')
const groups = ref<ConditionGroup[]>([{ mode: 'and', conditions: [defaultLeaf()] }])
const actions = ref<RuleAction[]>([{ type: 'block' }])

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

// ─── Actions editor ───────────────────────────────────────────────────────────

interface ActionMeta {
  type: RuleActionType
  label: string
  description: string
}

const ACTION_META: ActionMeta[] = [
  { type: 'block', label: 'Block', description: 'Silently discard — sender not notified' },
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
  { type: 'auto_reply', label: 'Auto reply', description: 'Send an automated reply' },
  { type: 'auto_draft', label: 'Auto draft', description: 'Pre-draft a reply' },
  { type: 'pong', label: 'Pong', description: 'Send an acknowledgement reply' },
  { type: 'delete', label: 'Delete', description: 'Permanently delete the signal' },
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

const addingAction = ref(false)
const actionTypeToAdd = ref<RuleActionType>('block')

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
    groups.value.every((g) => g.conditions.every((c) => c.value.trim().length > 0)),
)

async function save() {
  if (!canSave.value) return
  const body = {
    name: name.value.trim(),
    status: status.value,
    condition: serializeCondition(groups.value),
    actions: actions.value,
  }

  const saved = isEditing.value
    ? await rulesStore.updateRule(ruleId.value!, body)
    : await rulesStore.createRule(body)

  if (!saved) return

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
  await accountStore.fetchAccount()
  await Promise.all([labelsStore.fetchLabels(), templatesStore.fetchTemplates()])

  if (isEditing.value) {
    if (rulesStore.items.length === 0) await rulesStore.fetchRules()
    const existing = rulesStore.items.find((r) => r.id === ruleId.value)
    if (existing) {
      name.value = existing.name
      status.value = existing.status
      actions.value = [...existing.actions]
      groups.value = logicToGroups(existing.condition)
    }
  } else {
    if (signalAction.value) {
      actions.value = [{ type: signalAction.value === 'allow' ? 'approve_sender' : 'block' }]
    }
    if (signalId.value) {
      const signal = [...quarantineStore.quarantineVisible, ...quarantineStore.quarantineHidden].find((s) => s.id === signalId.value)
      if (signal) {
        groups.value = [
          {
            mode: 'and',
            conditions: [
              { field: 'signal.from.address', operator: 'equals', value: signal.from.address },
            ],
          },
        ]
        name.value = `${signalAction.value === 'allow' ? 'Allow' : 'Block'} ${signal.from.address}`
        testInput.value.fromAddress = signal.from.address
      }
    }
  }
})

watch(signalAction, (val) => {
  if (!isEditing.value && val) {
    actions.value = [{ type: val === 'allow' ? 'approve_sender' : 'block' }]
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
            <h1 class="text-lg font-semibold">{{ isEditing ? 'Edit rule' : 'New rule' }}</h1>
            <p v-if="signalId && !isEditing" class="mt-0.5 text-xs text-ctp-subtext0">
              Creating rule from quarantined signal — will be resolved after saving.
            </p>
          </div>
        </div>

        <!-- Enabled/disabled toggle -->
        <button
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

      <!-- Name -->
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
          <label class="text-xs font-medium text-ctp-subtext0">Conditions</label>
          <button class="text-xs text-ctp-mauve hover:underline" @click="addGroup">
            + Add group
          </button>
        </div>

        <div class="space-y-3">
          <div
            v-for="(group, gi) in groups"
            :key="gi"
            class="rounded-lg border border-ctp-surface1 bg-ctp-mantle p-3"
          >
            <!-- AND / OR toggle -->
            <div class="mb-2 flex items-center justify-between">
              <div class="flex items-center gap-1 rounded-full bg-ctp-surface0 p-0.5">
                <button
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
        </div>
      </section>

      <!-- Actions -->
      <section class="mb-6">
        <label class="mb-2 block text-xs font-medium text-ctp-subtext0">Actions</label>

        <div class="space-y-2">
          <div
            v-for="(act, idx) in actions"
            :key="idx"
            class="flex flex-wrap items-center gap-3 rounded-lg border border-ctp-surface1 bg-ctp-mantle px-3 py-2"
          >
            <span
              class="rounded-full bg-ctp-surface1 px-2.5 py-0.5 text-xs font-medium text-ctp-text"
            >
              {{ actionLabel(act.type) }}
            </span>

            <template v-if="act.type === 'assign_label'">
              <select
                :value="act.labelId ?? ''"
                class="rounded border border-ctp-surface1 bg-ctp-base px-2 py-0.5 text-xs text-ctp-text focus:border-ctp-mauve focus:outline-none"
                @change="updateAction(idx, { labelId: ($event.target as HTMLSelectElement).value })"
              >
                <option value="">Pick label…</option>
                <option v-for="l in labelsStore.items" :key="l.id" :value="l.id">
                  {{ l.name }}
                </option>
              </select>
            </template>

            <template v-else-if="act.type === 'assign_workflow'">
              <select
                :value="act.workflow ?? ''"
                class="rounded border border-ctp-surface1 bg-ctp-base px-2 py-0.5 text-xs text-ctp-text focus:border-ctp-mauve focus:outline-none"
                @change="
                  updateAction(idx, {
                    workflow: ($event.target as HTMLSelectElement).value as never,
                  })
                "
              >
                <option value="">Pick workflow…</option>
                <option v-for="w in WORKFLOW_OPTIONS" :key="w" :value="w">{{ w }}</option>
              </select>
            </template>

            <template v-else-if="act.type === 'set_urgency'">
              <select
                :value="act.urgency ?? ''"
                class="rounded border border-ctp-surface1 bg-ctp-base px-2 py-0.5 text-xs text-ctp-text focus:border-ctp-mauve focus:outline-none"
                @change="
                  updateAction(idx, {
                    urgency: ($event.target as HTMLSelectElement).value as never,
                  })
                "
              >
                <option value="">Pick urgency…</option>
                <option v-for="u in URGENCY_OPTIONS" :key="u" :value="u">{{ u }}</option>
              </select>
            </template>

            <template v-else-if="act.type === 'forward'">
              <input
                :value="act.forwardTo ?? ''"
                type="email"
                placeholder="forward@example.com"
                class="flex-1 rounded border border-ctp-surface1 bg-ctp-base px-2 py-0.5 text-xs text-ctp-text placeholder:text-ctp-subtext0 focus:border-ctp-mauve focus:outline-none"
                @input="updateAction(idx, { forwardTo: ($event.target as HTMLInputElement).value })"
              />
            </template>

            <template v-else-if="act.type === 'auto_reply' || act.type === 'auto_draft'">
              <select
                :value="act.templateId ?? ''"
                class="flex-1 rounded border border-ctp-surface1 bg-ctp-base px-2 py-0.5 text-xs text-ctp-text focus:border-ctp-mauve focus:outline-none"
                @change="updateAction(idx, { templateId: ($event.target as HTMLSelectElement).value || undefined })"
              >
                <option value="">— Select template —</option>
                <option v-for="tpl in templatesStore.templates" :key="tpl.id" :value="tpl.id">
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
          class="mt-2 text-xs text-ctp-mauve hover:underline"
          @click="addingAction = true"
        >
          + Add action
        </button>
      </section>

      <!-- Rule tester -->
      <section class="mb-6 rounded-lg border border-ctp-surface1 bg-ctp-mantle p-4">
        <h3 class="mb-3 text-xs font-medium text-ctp-subtext1">Test this rule</h3>
        <div class="grid gap-3 sm:grid-cols-2">
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
          <div>
            <label class="mb-1 block text-xs text-ctp-subtext0">Workflow</label>
            <input
              v-model="testInput.workflow"
              type="text"
              placeholder="e.g. conversation"
              class="w-full rounded border border-ctp-surface1 bg-ctp-base px-2 py-1.5 text-xs text-ctp-text placeholder:text-ctp-subtext0 focus:border-ctp-mauve focus:outline-none"
            />
          </div>
          <div>
            <label class="mb-1 block text-xs text-ctp-subtext0">Spam score (0–10)</label>
            <input
              v-model="testInput.spamScore"
              type="number"
              min="0"
              max="10"
              placeholder="0"
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
            :class="testResult ? 'text-ctp-green' : 'text-ctp-subtext0'"
          >
            {{ testResult ? '✓ Rule matches this email' : '✗ Rule does not match' }}
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

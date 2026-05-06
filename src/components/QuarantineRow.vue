<script setup lang="ts">
import { computed, inject, ref } from 'vue'
import type { CreateRuleBody, RuleAction, RuleConditionField, Signal } from '@/types/server'
import { NOW_KEY } from '@/composables/useRelativeTime'
import { formatRelativeTime } from '@/composables/useFormattedTime'

const props = defineProps<{
  signal: Signal
  pending: boolean
}>()

const emit = defineEmits<{
  (e: 'allow', signalId: string): void
  (e: 'block', signalId: string): void
  (e: 'createRule', signalId: string, body: CreateRuleBody, action: 'allow' | 'block'): void
}>()

const now = inject(NOW_KEY)
const timestamp = computed(() =>
  now ? formatRelativeTime(props.signal.receivedAt, now.value) : '',
)

const isUntrustedSender = computed(
  () =>
    props.signal.matchedRules?.some((r) => r.labels.includes('system:sender:untrusted')) ?? false,
)
const matchedRules = computed(() => props.signal.matchedRules ?? [])

// ── inline rule form ─────────────────────────────────────────────────────────

const ruleFormOpen = ref(false)
const ruleAction = ref<RuleAction>('allow')
const conditionField = ref<RuleConditionField>('from.address')
const conditionValue = ref('')
const ruleName = ref('')

const conditionFieldOptions: { value: RuleConditionField; label: string }[] = [
  { value: 'from.address', label: 'Sender email' },
  { value: 'from.domain', label: 'Sender domain' },
  { value: 'subject', label: 'Subject' },
]

function deriveConditionValue(field: RuleConditionField): string {
  if (field === 'from.address') return props.signal.from.address
  if (field === 'from.domain') {
    const addr = props.signal.from.address
    return addr.includes('@') ? addr.split('@')[1] : ''
  }
  return props.signal.subject
}

function deriveRuleName(field: RuleConditionField, action: RuleAction, val: string): string {
  const verb = action === 'allow' ? 'Allow' : 'Block'
  if (field === 'from.address') return `${verb} ${val}`
  if (field === 'from.domain') return `${verb} @${val}`
  if (field === 'subject') return `${verb} — subject contains "${val}"`
  return `${verb} rule`
}

function openRuleForm(action: RuleAction) {
  ruleAction.value = action
  conditionField.value = 'from.address'
  conditionValue.value = deriveConditionValue('from.address')
  ruleName.value = deriveRuleName('from.address', action, conditionValue.value)
  ruleFormOpen.value = true
}

function onConditionFieldChange() {
  conditionValue.value = deriveConditionValue(conditionField.value)
  ruleName.value = deriveRuleName(conditionField.value, ruleAction.value, conditionValue.value)
}

function onConditionValueInput() {
  ruleName.value = deriveRuleName(conditionField.value, ruleAction.value, conditionValue.value)
}

function submitRule() {
  if (!conditionValue.value.trim() || !ruleName.value.trim()) return
  const operator = conditionField.value === 'subject' ? 'contains' : 'equals'
  emit(
    'createRule',
    props.signal.id,
    {
      name: ruleName.value.trim(),
      conditions: [{ field: conditionField.value, operator, value: conditionValue.value.trim() }],
      action: ruleAction.value,
    },
    ruleAction.value as 'allow' | 'block',
  )
  ruleFormOpen.value = false
}

function cancelRule() {
  ruleFormOpen.value = false
}
</script>

<template>
  <div
    class="border-b border-ctp-surface0 transition-colors hover:bg-ctp-surface0"
    :class="{ 'opacity-50': pending }"
    role="listitem"
  >
    <div class="flex items-start gap-3 px-4 py-3">
      <!-- Quarantine reason badge -->
      <div class="mt-0.5 shrink-0">
        <span
          v-if="isUntrustedSender"
          class="inline-block rounded-full bg-ctp-peach/15 px-2 py-0.5 text-xs font-medium text-ctp-peach"
        >
          Untrusted sender
        </span>
        <span
          v-else-if="matchedRules.length"
          class="inline-block rounded-full bg-ctp-mauve/15 px-2 py-0.5 text-xs font-medium text-ctp-mauve"
        >
          Rule matched
        </span>
        <span
          v-else
          class="inline-block rounded-full bg-ctp-surface1 px-2 py-0.5 text-xs text-ctp-subtext0"
        >
          Quarantined
        </span>
      </div>

      <!-- Content -->
      <div class="min-w-0 flex-1">
        <div class="flex items-center justify-between gap-2">
          <p class="truncate text-sm font-medium text-ctp-text">
            {{ signal.from.name || signal.from.address }}
            <span class="font-normal text-ctp-subtext0">&lt;{{ signal.from.address }}&gt;</span>
          </p>
          <span class="shrink-0 text-xs text-ctp-subtext0">{{ timestamp }}</span>
        </div>

        <p class="mt-0.5 truncate text-sm text-ctp-subtext1">{{ signal.subject }}</p>

        <!-- Matched rule IDs -->
        <div v-if="matchedRules.length" class="mt-1 flex flex-wrap gap-1">
          <span
            v-for="rule in matchedRules"
            :key="rule.ruleId"
            class="inline-block rounded bg-ctp-surface1 px-1.5 py-0.5 font-mono text-xs text-ctp-subtext0"
          >
            {{ rule.ruleId }}
          </span>
        </div>

        <!-- Branch A: untrusted sender actions -->
        <div v-if="isUntrustedSender" class="mt-2 flex items-center gap-2">
          <button
            class="rounded bg-ctp-green/15 px-3 py-1 text-xs font-medium text-ctp-green transition-colors hover:bg-ctp-green/25 disabled:opacity-50"
            :disabled="pending"
            @click="emit('allow', signal.id)"
          >
            Allow
          </button>
          <button
            class="rounded bg-ctp-red/15 px-3 py-1 text-xs font-medium text-ctp-red transition-colors hover:bg-ctp-red/25 disabled:opacity-50"
            :disabled="pending"
            @click="emit('block', signal.id)"
          >
            Block
          </button>
        </div>

        <!-- Branch B: rule-matched actions -->
        <div v-else-if="matchedRules.length" class="mt-2 flex flex-wrap items-center gap-2">
          <button
            class="rounded bg-ctp-green/15 px-3 py-1 text-xs font-medium text-ctp-green transition-colors hover:bg-ctp-green/25 disabled:opacity-50"
            :disabled="pending || ruleFormOpen"
            @click="openRuleForm('allow')"
          >
            Create rule to allow
          </button>
          <button
            class="rounded bg-ctp-red/15 px-3 py-1 text-xs font-medium text-ctp-red transition-colors hover:bg-ctp-red/25 disabled:opacity-50"
            :disabled="pending || ruleFormOpen"
            @click="openRuleForm('block')"
          >
            Create rule to block
          </button>
        </div>
      </div>
    </div>

    <!-- Inline rule creation form -->
    <div
      v-if="ruleFormOpen"
      class="mx-4 mb-3 rounded-lg border border-ctp-surface1 bg-ctp-mantle p-3"
    >
      <p class="mb-3 text-xs font-medium text-ctp-subtext0">
        New rule — {{ ruleAction === 'allow' ? 'allow matching emails' : 'block matching emails' }}
      </p>

      <!-- Condition row -->
      <div class="mb-2 flex items-center gap-2">
        <span class="shrink-0 text-xs text-ctp-subtext0">When</span>
        <select
          v-model="conditionField"
          class="rounded border border-ctp-surface1 bg-ctp-surface0 px-2 py-1 text-xs text-ctp-text focus:border-ctp-blue focus:outline-none"
          @change="onConditionFieldChange"
        >
          <option v-for="opt in conditionFieldOptions" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>
        <span class="shrink-0 text-xs text-ctp-subtext0">
          {{ conditionField === 'subject' ? 'contains' : 'is' }}
        </span>
        <input
          v-model="conditionValue"
          type="text"
          class="min-w-0 flex-1 rounded border border-ctp-surface1 bg-ctp-surface0 px-2 py-1 text-xs text-ctp-text focus:border-ctp-blue focus:outline-none"
          @input="onConditionValueInput"
        />
      </div>

      <!-- Action toggle -->
      <div class="mb-3 flex items-center gap-3">
        <span class="text-xs text-ctp-subtext0">Action</span>
        <label class="flex cursor-pointer items-center gap-1.5 text-xs">
          <input v-model="ruleAction" type="radio" value="allow" class="accent-ctp-green" />
          <span class="text-ctp-green">Allow</span>
        </label>
        <label class="flex cursor-pointer items-center gap-1.5 text-xs">
          <input v-model="ruleAction" type="radio" value="block" class="accent-ctp-red" />
          <span class="text-ctp-red">Block</span>
        </label>
      </div>

      <!-- Rule name -->
      <div class="mb-3">
        <label class="mb-1 block text-xs text-ctp-subtext0">Rule name</label>
        <input
          v-model="ruleName"
          type="text"
          class="w-full rounded border border-ctp-surface1 bg-ctp-surface0 px-2 py-1 text-xs text-ctp-text focus:border-ctp-blue focus:outline-none"
        />
      </div>

      <!-- Buttons -->
      <div class="flex justify-end gap-2">
        <button
          class="rounded border border-ctp-surface1 px-3 py-1 text-xs text-ctp-subtext0 hover:text-ctp-text"
          @click="cancelRule"
        >
          Cancel
        </button>
        <button
          class="rounded px-3 py-1 text-xs font-medium transition-colors disabled:opacity-50"
          :class="
            ruleAction === 'allow'
              ? 'bg-ctp-green/15 text-ctp-green hover:bg-ctp-green/25'
              : 'bg-ctp-red/15 text-ctp-red hover:bg-ctp-red/25'
          "
          :disabled="!conditionValue.trim() || !ruleName.trim() || pending"
          @click="submitRule"
        >
          Save rule
        </button>
      </div>
    </div>
  </div>
</template>

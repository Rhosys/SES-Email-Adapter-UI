<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import { useAccountStore } from '@/stores/account'
import { useRulesStore } from '@/stores/rules'
import { useConfirmDialog } from '@/composables/useConfirmDialog'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import type { Rule, RuleActionType } from '@/types/server'

const accountStore = useAccountStore()
const rulesStore = useRulesStore()
const { dialogOpen, dialogOptions, confirm: confirmAction, onConfirm, onCancel } = useConfirmDialog()

const systemRules = computed(() => rulesStore.items.filter((r) => r.system))
const userRules = computed(() => rulesStore.items.filter((r) => !r.system))

const ACTION_LABELS: Partial<Record<RuleActionType, string>> = {
  block_hidden: 'Block (hidden)',
  block_reject: 'Block (reject)',
  quarantine: 'Quarantine',
  quarantine_hidden: 'Quarantine (hidden)',
  archive: 'Archive',
  assign_label: 'Label',
  assign_workflow: 'Workflow',
  set_urgency: 'Urgency',
  forward: 'Forward',
  approve_sender: 'Approve',
  suppress_notification: 'Suppress',
  auto_draft: 'Auto draft',
  pong: 'Pong',
  webhook: 'Webhook',
  forwardCalendarInvite: 'Forward calendar',
}

const ACTION_COLORS: Partial<Record<RuleActionType, string>> = {
  block_hidden: 'text-ctp-red bg-ctp-red/10',
  block_reject: 'text-ctp-red bg-ctp-red/10',
  quarantine: 'text-ctp-peach bg-ctp-peach/10',
  quarantine_hidden: 'text-ctp-peach bg-ctp-peach/10',
  archive: 'text-ctp-subtext0 bg-ctp-surface1',
  assign_label: 'text-ctp-blue bg-ctp-blue/10',
  approve_sender: 'text-ctp-green bg-ctp-green/10',
  forward: 'text-ctp-sapphire bg-ctp-sapphire/10',
  set_urgency: 'text-ctp-yellow bg-ctp-yellow/10',
  suppress_notification: 'text-ctp-lavender bg-ctp-lavender/10',
  pong: 'text-ctp-teal bg-ctp-teal/10',
  auto_draft: 'text-ctp-mauve bg-ctp-mauve/10',
  webhook: 'text-ctp-mauve bg-ctp-mauve/10',
}

function conditionSummary(rule: Rule): string {
  if (!rule.condition) return 'Match all emails'
  try {
    const tree = JSON.parse(rule.condition) as unknown
    return summarizeLogic(tree)
  } catch {
    return rule.condition
  }
}

function summarizeLogic(node: unknown, depth = 0): string {
  if (typeof node !== 'object' || !node) return String(node)
  const obj = node as Record<string, unknown>

  if ('and' in obj && Array.isArray(obj.and)) {
    const parts = (obj.and as unknown[]).map((c) => summarizeLogic(c, depth + 1))
    const joined = parts.join(' AND ')
    return depth > 0 ? `(${joined})` : joined
  }
  if ('or' in obj && Array.isArray(obj.or)) {
    const parts = (obj.or as unknown[]).map((c) => summarizeLogic(c, depth + 1))
    const joined = parts.join(' OR ')
    return depth > 0 ? `(${joined})` : joined
  }

  const varOf = (v: unknown) =>
    typeof v === 'object' && v && 'var' in v ? (v as { var: string }).var : String(v)

  if ('==' in obj) {
    const [a, b] = obj['=='] as unknown[]
    return `${varOf(a)} = "${b}"`
  }
  if ('!=' in obj) {
    const [a, b] = obj['!='] as unknown[]
    return `${varOf(a)} ≠ "${b}"`
  }
  if ('>' in obj) {
    const [a, b] = obj['>'] as unknown[]
    return `${varOf(a)} > ${b}`
  }
  if ('<' in obj) {
    const [a, b] = obj['<'] as unknown[]
    return `${varOf(a)} < ${b}`
  }
  if ('in' in obj) {
    const [n, h] = obj['in'] as unknown[]
    return `${varOf(h)} contains "${n}"`
  }
  if ('!' in obj) return `NOT (${summarizeLogic(obj['!'], depth + 1)})`
  if ('startsWith' in obj) {
    const [s, p] = obj['startsWith'] as unknown[]
    return `${varOf(s)} starts with "${p}"`
  }
  if ('endsWith' in obj) {
    const [s, p] = obj['endsWith'] as unknown[]
    return `${varOf(s)} ends with "${p}"`
  }
  return JSON.stringify(node)
}

async function deleteRule(rule: Rule) {
  const confirmed = await confirmAction({
    title: 'Delete rule',
    message: `Delete "${rule.name}"? This cannot be undone.`,
    confirmLabel: 'Delete',
    confirmVariant: 'danger',
  })
  if (!confirmed) return
  await rulesStore.deleteRule(rule.ruleId)
}

async function toggleSystemRule(rule: Rule) {
  const newStatus = rule.status === 'enabled' ? 'disabled' : 'enabled'
  await rulesStore.updateRule(rule.ruleId, { status: newStatus })
}

async function moveUp(rule: Rule) {
  await rulesStore.moveRule(rule.ruleId, -1)
}

async function moveDown(rule: Rule) {
  await rulesStore.moveRule(rule.ruleId, 1)
}

// ─── Drag and drop ────────────────────────────────────────────────────────────

const draggingId = ref<string | null>(null)
const dragOverId = ref<string | null>(null)

function onDragStart(ruleId: string) {
  draggingId.value = ruleId
}

function onDragOver(e: DragEvent, ruleId: string) {
  e.preventDefault()
  dragOverId.value = ruleId
}

async function onDrop(targetId: string) {
  const sourceId = draggingId.value
  draggingId.value = null
  dragOverId.value = null
  if (sourceId && sourceId !== targetId) {
    await rulesStore.reorderRule(sourceId, targetId)
  }
}

function onDragEnd() {
  draggingId.value = null
  dragOverId.value = null
}

onMounted(async () => {
  await accountStore.fetchAccount()
  await rulesStore.fetchRules()
})
</script>

<template>
  <div>
    <header class="border-b border-ctp-surface0 bg-ctp-mantle px-4 py-3">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-lg font-semibold">Rules</h1>
          <p class="mt-0.5 text-xs text-ctp-subtext0">
            Automatically process incoming emails — run in priority order, top first
          </p>
        </div>
        <RouterLink
          to="/rules/new"
          class="rounded bg-ctp-mauve px-3 py-1.5 text-xs font-medium text-ctp-base hover:opacity-90"
        >
          + New rule
        </RouterLink>
      </div>
    </header>

    <main class="mx-auto max-w-3xl px-4 py-6">
      <!-- Error -->
      <div
        v-if="rulesStore.error"
        class="mb-4 rounded-lg border border-ctp-red bg-ctp-red/10 px-4 py-3 text-sm text-ctp-red"
      >
        {{ rulesStore.error }}
        <button class="ml-2 underline" @click="rulesStore.clearError()">Dismiss</button>
      </div>

      <!-- Loading -->
      <div
        v-if="rulesStore.loading"
        role="status"
        aria-label="Loading rules…"
        class="animate-pulse divide-y divide-ctp-surface0 rounded-lg border border-ctp-surface0"
      >
        <div v-for="i in 5" :key="i" class="flex items-center gap-3 px-4 py-3">
          <div class="h-4 w-4 shrink-0 rounded bg-ctp-surface1" />
          <div class="flex-1 space-y-1.5">
            <div class="h-4 rounded bg-ctp-surface1" :style="{ width: `${45 + (i * 17) % 40}%` }" />
            <div class="h-3 w-40 rounded bg-ctp-surface1" />
          </div>
          <div class="h-6 w-6 shrink-0 rounded bg-ctp-surface1" />
          <div class="h-6 w-6 shrink-0 rounded bg-ctp-surface1" />
        </div>
      </div>

      <!-- Empty (user rules only) -->
      <div
        v-else-if="userRules.length === 0 && systemRules.length === 0"
        class="py-20 text-center"
      >
        <p class="text-base font-medium text-ctp-text">Every email handled on autopilot</p>
        <p class="mx-auto mt-2 max-w-sm text-sm text-ctp-subtext0">
          Rules run the moment a message arrives — label it, archive it, forward it, or block the
          sender. Create your first rule to stop doing it manually.
        </p>
        <RouterLink
          to="/rules/new"
          class="mt-4 inline-block rounded-lg bg-ctp-mauve px-4 py-2 text-sm font-medium text-ctp-base hover:opacity-90"
        >
          Create your first rule
        </RouterLink>
      </div>

      <template v-else>
        <!-- System rules section -->
        <div v-if="systemRules.length > 0" class="mb-6">
          <h2 class="mb-2 text-xs font-medium uppercase tracking-wide text-ctp-subtext0">System rules</h2>
          <div class="divide-y divide-ctp-surface0 rounded-lg border border-ctp-surface0">
            <div
              v-for="rule in systemRules"
              :key="rule.ruleId"
              class="flex items-center gap-3 px-4 py-3"
            >
              <!-- Toggle switch -->
              <button
                role="switch"
                :aria-checked="rule.status === 'enabled'"
                :aria-label="`${rule.status === 'enabled' ? 'Disable' : 'Enable'} ${rule.name}`"
                class="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors"
                :class="rule.status === 'enabled' ? 'bg-ctp-green' : 'bg-ctp-surface1'"
                @click="toggleSystemRule(rule)"
              >
                <span
                  class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
                  :class="rule.status === 'enabled' ? 'translate-x-4' : 'translate-x-0.5'"
                />
              </button>

              <!-- Name + actions summary -->
              <div class="min-w-0 flex-1">
                <p class="text-sm text-ctp-text" :class="{ 'opacity-50': rule.status === 'disabled' }">{{ rule.name }}</p>
                <div class="mt-0.5 flex flex-wrap gap-1">
                  <span
                    v-for="action in rule.actions"
                    :key="action.type"
                    class="rounded-full px-2 py-0.5 text-xs"
                    :class="ACTION_COLORS[action.type] ?? 'text-ctp-subtext0 bg-ctp-surface1'"
                  >
                    {{ ACTION_LABELS[action.type] ?? action.type }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- User rules header -->
        <div v-if="userRules.length > 0 || systemRules.length > 0" class="mb-2">
          <h2 class="text-xs font-medium uppercase tracking-wide text-ctp-subtext0">Your rules</h2>
        </div>

        <!-- User rules empty -->
        <div v-if="userRules.length === 0 && systemRules.length > 0" class="py-12 text-center">
          <p class="text-sm text-ctp-subtext0">No custom rules yet — system rules are handling the basics.</p>
          <RouterLink
            to="/rules/new"
            class="mt-3 inline-block rounded-lg bg-ctp-mauve px-4 py-2 text-sm font-medium text-ctp-base hover:opacity-90"
          >
            Create a rule
          </RouterLink>
        </div>
      </template>

      <!-- Rules list with move animation -->
      <TransitionGroup
        v-if="userRules.length > 0"
        name="rule-row"
        tag="div"
        class="relative divide-y divide-ctp-surface0 rounded-lg border border-ctp-surface0"
      >
        <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions -- drag is a mouse enhancement; keyboard reorder uses the ▲/▼ buttons -->
        <div
          v-for="(rule, idx) in userRules"
          :key="rule.ruleId"
          draggable="true"
          class="flex cursor-grab items-start gap-3 px-4 py-4 transition-colors active:cursor-grabbing"
          :class="{
            'opacity-40': rule.ruleId === draggingId,
            'opacity-50': rule.status === 'disabled' && rule.ruleId !== draggingId,
            'border-t-2 border-t-ctp-mauve': rule.ruleId === dragOverId && rule.ruleId !== draggingId,
          }"
          @dragstart="onDragStart(rule.ruleId)"
          @dragover="onDragOver($event, rule.ruleId)"
          @drop.prevent="onDrop(rule.ruleId)"
          @dragend="onDragEnd"
        >
          <!-- Priority arrows -->
          <div class="flex shrink-0 flex-col items-center gap-0.5 pt-0.5">
            <button
              :disabled="idx === 0"
              class="text-ctp-subtext0 hover:text-ctp-text disabled:opacity-20"
              aria-label="Move rule up"
              @click="moveUp(rule)"
            >
              ▲
            </button>
            <span class="text-xs text-ctp-surface2">{{ idx + 1 }}</span>
            <button
              :disabled="idx === userRules.length - 1"
              class="text-ctp-subtext0 hover:text-ctp-text disabled:opacity-20"
              aria-label="Move rule down"
              @click="moveDown(rule)"
            >
              ▼
            </button>
          </div>

          <!-- Rule details -->
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-1.5">
              <span class="text-sm font-medium text-ctp-text">{{ rule.name }}</span>

              <!-- Status badge -->
              <span
                v-if="rule.status === 'disabled'"
                class="rounded-full bg-ctp-surface1 px-2 py-0.5 text-xs text-ctp-subtext0"
              >
                disabled
              </span>

              <!-- Action badges -->
              <span
                v-for="act in rule.actions"
                :key="act.type"
                class="rounded-full px-2 py-0.5 text-xs font-medium"
                :class="ACTION_COLORS[act.type] ?? 'text-ctp-subtext0 bg-ctp-surface1'"
              >
                {{ ACTION_LABELS[act.type] ?? act.type }}
              </span>
            </div>

            <p class="mt-1 font-mono text-xs text-ctp-subtext0">
              {{ conditionSummary(rule) }}
            </p>
          </div>

          <!-- Row actions -->
          <div class="flex shrink-0 items-center gap-2">
            <RouterLink
              :to="`/rules/${rule.ruleId}`"
              class="text-xs text-ctp-subtext0 hover:text-ctp-text"
            >
              Edit
            </RouterLink>
            <button class="text-ctp-subtext0 hover:text-ctp-red" title="Delete" @click="deleteRule(rule)">
              <svg class="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4h12M5.333 4V2.667a1.333 1.333 0 011.334-1.334h2.666a1.333 1.333 0 011.334 1.334V4m2 0v9.333a1.333 1.333 0 01-1.334 1.334H4.667a1.333 1.333 0 01-1.334-1.334V4h9.334z"/></svg>
            </button>
          </div>
        </div>
      </TransitionGroup>
    </main>
  </div>

  <ConfirmDialog
    :open="dialogOpen"
    :title="dialogOptions.title"
    :message="dialogOptions.message"
    :confirm-label="dialogOptions.confirmLabel"
    :confirm-variant="dialogOptions.confirmVariant"
    @confirm="onConfirm"
    @cancel="onCancel"
  />
</template>

<style scoped>
.rule-row-enter-active {
  transition: opacity 250ms ease, transform 250ms ease;
}
.rule-row-enter-from {
  opacity: 0;
  transform: translateY(-6px);
}
.rule-row-leave-active {
  transition: opacity 180ms ease;
  position: absolute;
  left: 0;
  right: 0;
}
.rule-row-leave-to {
  opacity: 0;
}
.rule-row-move {
  transition: transform 250ms ease;
}
</style>

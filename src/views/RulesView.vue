<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import { useAccountStore } from '@/stores/account'
import { useRulesStore } from '@/stores/rules'
import type { Rule, RuleActionType } from '@/types/server'

const accountStore = useAccountStore()
const rulesStore = useRulesStore()

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
  if (!confirm(`Delete rule "${rule.name}"?`)) return
  await rulesStore.deleteRule(rule.ruleId)
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

      <!-- Empty -->
      <div
        v-else-if="rulesStore.items.length === 0"
        class="rounded-lg border border-dashed border-ctp-surface1 py-20 text-center"
      >
        <p class="text-sm font-medium text-ctp-text">Every email handled on autopilot</p>
        <p class="mt-1 text-xs text-ctp-subtext0">
          Rules run the moment a message arrives — label it, archive it, forward it, or block the
          sender. Create your first rule to stop doing it manually.
        </p>
        <RouterLink
          to="/rules/new"
          class="mt-4 inline-block rounded bg-ctp-mauve px-4 py-2 text-sm font-medium text-ctp-base hover:opacity-90"
        >
          Create your first rule
        </RouterLink>
      </div>

      <!-- Rules list with move animation -->
      <TransitionGroup
        v-else
        name="rule-row"
        tag="div"
        class="relative divide-y divide-ctp-surface0 rounded-lg border border-ctp-surface0"
      >
        <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions -- drag is a mouse enhancement; keyboard reorder uses the ▲/▼ buttons -->
        <div
          v-for="(rule, idx) in rulesStore.items"
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
              :disabled="idx === rulesStore.items.length - 1"
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
            <button class="text-xs text-ctp-red hover:text-ctp-red/80" @click="deleteRule(rule)">
              Delete
            </button>
          </div>
        </div>
      </TransitionGroup>
    </main>
  </div>
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

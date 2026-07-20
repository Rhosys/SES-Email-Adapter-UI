<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import { useRulesStore } from '@/stores/rules'
import { useConfirmDialog } from '@/composables/useConfirmDialog'
import { useIsMobile } from '@/composables/useIsMobile'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import OverflowMenu from '@/components/ui/OverflowMenu.vue'
import ActionBadge from '@/components/ActionBadge.vue'
import { conditionSummary } from '@/lib/rule-display'
import type { Rule } from '@/types/server'

const rulesStore = useRulesStore()
const { dialogOpen, dialogOptions, confirm: confirmAction, onConfirm, onCancel } = useConfirmDialog()
const isMobile = useIsMobile()

// One ordered list, system and user rules interleaved by priorityOrder (the
// store already sorts this way) — a single row layout for every rule, since
// the backend now accepts priorityOrder overrides for system rules too, not
// just status. Edit/Delete are still user-rule-only (system rule conditions
// and actions are immutable server-side).
const rules = computed(() => rulesStore.items)

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

async function toggleRule(rule: Rule) {
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
  await rulesStore.fetchRules()
})
</script>

<template>
  <div>
    <header class="border-b border-ctp-surface0 bg-ctp-mantle px-4 py-3">
      <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 class="hidden text-lg font-semibold sm:block">Rules</h1>
          <p class="mt-0.5 text-xs text-ctp-subtext0">
            Automatically process incoming emails — run in priority order, top first
          </p>
        </div>
        <RouterLink
          to="/rules/new"
          class="inline-block shrink-0 self-start whitespace-nowrap rounded bg-ctp-mauve px-3 py-1.5 text-xs font-medium text-ctp-base hover:opacity-90"
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
      <div v-else-if="rules.length === 0" class="py-20 text-center">
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

      <!-- Rules list with move animation — one row layout for system and user
           rules alike; every rule can be toggled and reordered, but only user
           rules can be edited or deleted (system rule conditions/actions are
           immutable server-side). -->
      <TransitionGroup
        v-else
        name="rule-row"
        tag="div"
        class="relative divide-y divide-ctp-surface0 rounded-lg border border-ctp-surface0"
      >
        <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions -- drag is a mouse enhancement; keyboard reorder uses the chevron buttons -->
        <div
          v-for="(rule, idx) in rules"
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
          <!-- Toggle switch -->
          <button
            role="switch"
            :aria-checked="rule.status === 'enabled'"
            :aria-label="`${rule.status === 'enabled' ? 'Disable' : 'Enable'} ${rule.name}`"
            class="relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors"
            :class="rule.status === 'enabled' ? 'bg-ctp-green' : 'bg-ctp-surface1'"
            @click="toggleRule(rule)"
          >
            <span
              class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
              :class="rule.status === 'enabled' ? 'translate-x-4' : 'translate-x-0.5'"
            />
          </button>

          <!-- Priority arrows -->
          <div class="flex shrink-0 flex-col items-center gap-0.5 pt-0.5">
            <button
              :disabled="idx === 0"
              class="text-ctp-subtext0 hover:text-ctp-text disabled:opacity-20"
              aria-label="Move rule up"
              @click="moveUp(rule)"
            >
              <svg class="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10l4-4 4 4" /></svg>
            </button>
            <span class="text-xs text-ctp-surface2">{{ idx + 1 }}</span>
            <button
              :disabled="idx === rules.length - 1"
              class="text-ctp-subtext0 hover:text-ctp-text disabled:opacity-20"
              aria-label="Move rule down"
              @click="moveDown(rule)"
            >
              <svg class="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6l4 4 4-4" /></svg>
            </button>
          </div>

          <!-- Rule details -->
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-1.5">
              <span class="text-sm font-medium text-ctp-text" :class="{ 'opacity-50': rule.status === 'disabled' }">{{ rule.name }}</span>

              <!-- Status badge -->
              <span
                v-if="rule.status === 'disabled'"
                class="rounded-full bg-ctp-surface1 px-2 py-0.5 text-xs text-ctp-subtext0"
              >
                disabled
              </span>

              <!-- Action badges -->
              <ActionBadge v-for="act in rule.actions" :key="act.type" :type="act.type" />
            </div>

            <p class="mt-1 font-mono text-xs text-ctp-subtext0">
              {{ conditionSummary(rule) }}
            </p>
          </div>

          <!-- Row actions — user rules only; system rules can only be
               toggled/reordered above. -->
          <div v-if="!rule.system" class="flex shrink-0 items-center gap-2">
            <RouterLink
              v-if="!isMobile"
              :to="`/rules/${rule.ruleId}`"
              class="text-xs text-ctp-subtext0 hover:text-ctp-text"
            >
              Edit
            </RouterLink>
            <OverflowMenu
              :label="`Actions for ${rule.name}`"
              sheet-title="Rule actions"
              menu-width-class="min-w-32"
              icon-class="h-3.5 w-3.5"
              trigger-class="flex h-7 w-7 items-center justify-center rounded text-ctp-subtext0 hover:bg-ctp-surface1 hover:text-ctp-text"
            >
              <RouterLink
                v-if="isMobile"
                :to="`/rules/${rule.ruleId}`"
                role="menuitem"
                class="block px-3 py-1.5 text-left text-xs text-ctp-subtext1 hover:bg-ctp-surface0 hover:text-ctp-text"
              >
                Edit
              </RouterLink>
              <button
                type="button"
                role="menuitem"
                class="flex w-full items-center px-3 py-1.5 text-left text-xs text-ctp-red hover:bg-ctp-surface0"
                @click="deleteRule(rule)"
              >
                Delete
              </button>
            </OverflowMenu>
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

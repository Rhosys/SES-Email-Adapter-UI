<script setup lang="ts">
import { onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import { useAccountStore } from '@/stores/account'
import { useRulesStore } from '@/stores/rules'
import type { Rule } from '@/types/server'

const accountStore = useAccountStore()
const rulesStore = useRulesStore()

const ACTION_LABELS: Record<string, string> = {
  allow: 'Allow',
  block: 'Block',
  label: 'Label',
  quarantine: 'Quarantine',
}

const ACTION_COLORS: Record<string, string> = {
  allow: 'text-ctp-green bg-ctp-green/10',
  block: 'text-ctp-red bg-ctp-red/10',
  label: 'text-ctp-blue bg-ctp-blue/10',
  quarantine: 'text-ctp-peach bg-ctp-peach/10',
}

function conditionSummary(rule: Rule): string {
  return rule.conditions
    .map((c) => `${c.field} ${c.operator.replace('_', ' ')} "${c.value}"`)
    .join(' AND ')
}

async function deleteRule(rule: Rule) {
  if (!accountStore.accountId) return
  if (!confirm(`Delete rule "${rule.name}"?`)) return
  await rulesStore.deleteRule(accountStore.accountId, rule.id)
}

onMounted(async () => {
  if (!accountStore.accountId) await accountStore.fetchAccount()
  if (accountStore.accountId) await rulesStore.fetchRules(accountStore.accountId)
})
</script>

<template>
  <div>
    <header class="border-b border-ctp-surface0 bg-ctp-mantle px-4 py-3">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-lg font-semibold">Rules</h1>
          <p class="mt-0.5 text-xs text-ctp-subtext0">
            Automatically allow, block, or label incoming emails
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
      <div v-if="rulesStore.loading" class="py-20 text-center text-sm text-ctp-subtext0">
        Loading…
      </div>

      <!-- Empty -->
      <div
        v-else-if="rulesStore.items.length === 0"
        class="rounded-lg border border-dashed border-ctp-surface1 py-20 text-center"
      >
        <p class="text-sm text-ctp-subtext1">No rules yet</p>
        <p class="mt-1 text-xs text-ctp-subtext0">
          Rules automatically process incoming emails based on conditions you define.
        </p>
        <RouterLink
          to="/rules/new"
          class="mt-4 inline-block rounded bg-ctp-mauve px-4 py-2 text-sm font-medium text-ctp-base hover:opacity-90"
        >
          Create your first rule
        </RouterLink>
      </div>

      <!-- Rules list -->
      <div v-else class="divide-y divide-ctp-surface0 rounded-lg border border-ctp-surface0">
        <div v-for="rule in rulesStore.items" :key="rule.id" class="px-4 py-4">
          <div class="flex items-start justify-between gap-3">
            <div class="flex-1">
              <div class="flex items-center gap-2">
                <span class="text-sm font-medium text-ctp-text">{{ rule.name }}</span>
                <span
                  class="rounded-full px-2 py-0.5 text-xs font-medium"
                  :class="ACTION_COLORS[rule.action] ?? 'text-ctp-subtext0 bg-ctp-surface1'"
                >
                  {{ ACTION_LABELS[rule.action] ?? rule.action }}
                </span>
              </div>
              <p class="mt-1 font-mono text-xs text-ctp-subtext0">
                {{ conditionSummary(rule) }}
              </p>
            </div>
            <div class="flex items-center gap-2 shrink-0">
              <RouterLink
                :to="`/rules/${rule.id}`"
                class="text-xs text-ctp-subtext0 hover:text-ctp-text"
              >
                Edit
              </RouterLink>
              <button class="text-xs text-ctp-red hover:text-ctp-red/80" @click="deleteRule(rule)">
                Delete
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

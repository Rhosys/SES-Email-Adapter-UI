<script setup lang="ts">
import { ref, computed, inject, watch, onMounted } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import { useAccountStore } from '@/stores/account'
import { api } from '@/lib/api'
import type { Thread, Rule, Signal, Alias, EmailTemplate } from '@/types/server'
import { isEmailSignal } from '@/lib/signal-guards'
import { visibleLabels, findLabelMeta } from '@/lib/labels'
import { formatRelativeTime } from '@/composables/useFormattedTime'
import { NOW_KEY } from '@/composables/useRelativeTime'
import { useLabelsStore } from '@/stores/labels'
import SignalRenderer from '@/components/SignalRenderer.vue'
import ActionBadge from '@/components/ActionBadge.vue'
import StatusBadge from '@/components/StatusBadge.vue'

const now = inject(NOW_KEY)

const route = useRoute()
const router = useRouter()
const accountStore = useAccountStore()
const labelsStore = useLabelsStore()

function labelMeta(label: string) {
  return findLabelMeta(labelsStore.items, label)
}

const query = ref((route.query.q as string) ?? '')
const searching = ref(false)

type SectionKey = 'threads' | 'signals' | 'aliases' | 'rules' | 'templates'

const visibleSections = ref<Set<SectionKey>>(new Set(['threads', 'signals', 'aliases', 'rules', 'templates']))

const results = ref<{
  threads: Thread[]
  signals: Signal[]
  aliases: Alias[]
  rules: Rule[]
  templates: EmailTemplate[]
  error: string | null
}>({ threads: [], signals: [], aliases: [], rules: [], templates: [], error: null })

const hasResults = computed(
  () =>
    results.value.threads.length > 0 ||
    results.value.signals.length > 0 ||
    results.value.aliases.length > 0 ||
    results.value.rules.length > 0 ||
    results.value.templates.length > 0,
)

const searched = ref(false)
const expandedSignals = ref<Set<string>>(new Set())

function isBlockedSignal(s: Signal): boolean {
  return s.status === 'block_hidden' || s.status === 'block_reject' || s.status === 'report_violation'
}

function handleSignalClick(s: Signal) {
  if (isBlockedSignal(s)) {
    if (expandedSignals.value.has(s.signalId)) {
      expandedSignals.value.delete(s.signalId)
    } else {
      expandedSignals.value.add(s.signalId)
    }
    return
  }
  if (s.threadId) {
    void router.push(`/threads/${s.threadId}`)
  } else {
    void router.push(`/quarantine/${s.signalId}`)
  }
}

async function directLookup(id: string): Promise<boolean> {
  const accountId = accountStore.accountId
  if (!accountId) return false

  searching.value = true
  searched.value = false
  results.value = { threads: [], signals: [], aliases: [], rules: [], templates: [], error: null }

  const [signalRes, threadRes, aliasesRes, rulesRes, templatesRes] = await Promise.all([
    api.getSignal(accountId, 'QUARANTINED', id),
    api.getThread(accountId, id),
    api.listAliases(accountId),
    api.listRules(accountId),
    api.listTemplates(accountId),
  ])

  if (signalRes.isOk()) results.value.signals.push(signalRes.value)
  if (threadRes.isOk()) results.value.threads.push(threadRes.value)
  if (aliasesRes.isOk()) {
    const match = aliasesRes.value.find((a) => a.alias === id || a.address === id)
    if (match) results.value.aliases.push(match)
  }
  if (rulesRes.isOk()) {
    const match = rulesRes.value.find((r) => r.ruleId === id)
    if (match) results.value.rules.push(match)
  }
  if (templatesRes.isOk()) {
    const match = templatesRes.value.find((t) => t.templateId === id)
    if (match) results.value.templates.push(match)
  }

  searching.value = false
  searched.value = true

  return hasResults.value
}

async function onPaste(event: ClipboardEvent) {
  const pasted = event.clipboardData?.getData('text/plain')?.trim()
  if (!pasted) return

  // Wait for v-model to update
  await new Promise((r) => setTimeout(r, 0))
  query.value = pasted
  void router.replace({ path: '/search', query: { q: pasted } })

  const found = await directLookup(pasted)
  if (!found) {
    await doSearch()
  }
}

async function doSearch() {
  const q = query.value.trim()
  if (!q || !accountStore.accountId) return
  void router.replace({ path: '/search', query: { q } })

  searching.value = true
  searched.value = false
  results.value = { threads: [], signals: [], aliases: [], rules: [], templates: [], error: null }

  const id = accountStore.accountId

  const [threadsRes, aliasesRes, rulesRes, templatesRes] = await Promise.all([
    api.listThreads(id, { sender: q, limit: 20 }),
    api.listAliases(id),
    api.listRules(id),
    api.listTemplates(id),
  ])

  searching.value = false
  searched.value = true

  if (threadsRes.isOk()) {
    const ql = q.toLowerCase()
    results.value.threads = threadsRes.value.threads.filter(
      (a) =>
        a.summary?.toLowerCase().includes(ql) ||
        a.labels?.some((l) => l.toLowerCase().includes(ql)),
    )
  }

  if (aliasesRes.isOk()) {
    const ql = q.toLowerCase()
    results.value.aliases = aliasesRes.value.filter((a) => a.address.toLowerCase().includes(ql))
  }

  if (rulesRes.isOk()) {
    const ql = q.toLowerCase()
    results.value.rules = rulesRes.value.filter(
      (r) => r.name.toLowerCase().includes(ql) || (r.condition ?? '').toLowerCase().includes(ql),
    )
  }

  if (templatesRes.isOk()) {
    const ql = q.toLowerCase()
    results.value.templates = templatesRes.value.filter(
      (t) => t.name.toLowerCase().includes(ql) || t.subject.toLowerCase().includes(ql),
    )
  }

  if (threadsRes.isErr() || aliasesRes.isErr() || rulesRes.isErr() || templatesRes.isErr()) {
    results.value.error =
      (threadsRes.isErr() && threadsRes.error.message) ||
      (aliasesRes.isErr() && aliasesRes.error.message) ||
      (rulesRes.isErr() && rulesRes.error.message) ||
      (templatesRes.isErr() && templatesRes.error.message) ||
      'Search failed'
  }
}

// Auto-search once at least 3 characters are entered (mirrors the navbar lookahead on desktop)
let autoSearchTimer: ReturnType<typeof setTimeout> | null = null

watch(query, (q) => {
  if (autoSearchTimer) clearTimeout(autoSearchTimer)
  if (q.trim().length < 3) return
  autoSearchTimer = setTimeout(() => void doSearch(), 300)
})

function toggleSection(key: SectionKey) {
  if (visibleSections.value.has(key)) {
    if (visibleSections.value.size > 1) visibleSections.value.delete(key)
  } else {
    visibleSections.value.add(key)
  }
}

function relTime(iso: string): string {
  return now ? formatRelativeTime(iso, now.value) : ''
}

// Search on load if query param present
if (query.value) {
  void doSearch()
}

const queryInput = ref<HTMLInputElement | null>(null)

onMounted(() => {
  queryInput.value?.focus()
})
</script>

<template>
  <div>
    <header class="hidden border-b border-ctp-surface0 bg-ctp-mantle px-4 py-3 sm:block">
      <h1 class="text-lg font-semibold">Search</h1>
    </header>

    <main class="mx-auto max-w-3xl px-4 py-6">
      <!-- Search input (hidden when viewing drafts) -->
      <form v-if="!route.query.status" class="mb-6 flex flex-col gap-2 sm:flex-row" @submit.prevent="doSearch">
        <input
          ref="queryInput"
          v-model="query"
          type="search"
          aria-label="Search threads, signals, aliases, rules"
          placeholder="Search threads, signals, aliases, rules…"
          class="flex-1 rounded-lg border border-ctp-surface1 bg-ctp-mantle px-4 py-2 text-sm text-ctp-text placeholder:text-ctp-subtext0 focus:border-ctp-mauve focus:outline-none"
          @paste="onPaste"
        />
        <button
          type="submit"
          :disabled="searching || !query.trim()"
          class="rounded-lg bg-ctp-mauve px-4 py-2 text-sm font-medium text-ctp-base hover:opacity-90 disabled:opacity-50"
        >
          {{ searching ? 'Searching…' : 'Search' }}
        </button>
      </form>

      <!-- Error -->
      <div
        v-if="results.error"
        class="mb-4 rounded-lg border border-ctp-red bg-ctp-red/10 px-4 py-3 text-sm text-ctp-red"
      >
        {{ results.error }}
      </div>

      <!-- Section visibility toggles -->
      <div v-if="searched && hasResults" class="mb-4 flex flex-wrap items-center gap-2">
        <span class="text-xs text-ctp-subtext0">Show:</span>
        <button
          v-for="{ key, label, count } in [
            { key: 'threads' as SectionKey, label: 'Threads', count: results.threads.length },
            { key: 'signals' as SectionKey, label: 'Signals', count: results.signals.length },
            { key: 'aliases' as SectionKey, label: 'Addresses', count: results.aliases.length },
            { key: 'rules' as SectionKey, label: 'Rules', count: results.rules.length },
            { key: 'templates' as SectionKey, label: 'Templates', count: results.templates.length },
          ]"
          :key="key"
          class="flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors"
          :class="
            visibleSections.has(key)
              ? 'border-ctp-mauve bg-ctp-mauve/10 text-ctp-mauve'
              : 'border-ctp-surface1 text-ctp-subtext0 hover:border-ctp-surface2 hover:text-ctp-text'
          "
          :aria-pressed="visibleSections.has(key)"
          :disabled="visibleSections.has(key) && visibleSections.size === 1"
          @click="toggleSection(key)"
        >
          <span
            class="h-1.5 w-1.5 rounded-full"
            :class="visibleSections.has(key) ? 'bg-ctp-mauve' : 'bg-ctp-surface2'"
          />
          {{ label }}
          <span
            v-if="count"
            class="rounded px-1 text-xs"
            :class="visibleSections.has(key) ? 'bg-ctp-mauve/20' : 'bg-ctp-surface1'"
            >{{ count }}</span
          >
        </button>
      </div>

      <!-- No results -->
      <div
        v-if="searched && !hasResults && !searching"
        class="py-16 text-center text-sm text-ctp-subtext0"
      >
        <p class="font-medium text-ctp-text">No results for "{{ query }}"</p>
        <p class="mt-1">
          Try a sender address, part of a subject line, or a rule name — search checks across all
          of them.
        </p>
      </div>

      <!-- Threads section -->
      <section v-if="visibleSections.has('threads') && results.threads.length > 0" class="mb-6">
        <h2 class="mb-2 text-xs font-semibold uppercase tracking-wide text-ctp-subtext0">
          Threads ({{ results.threads.length }})
        </h2>
        <div class="divide-y divide-ctp-surface0 rounded-lg border border-ctp-surface0">
          <RouterLink
            v-for="thread in results.threads"
            :key="thread.threadId"
            :to="`/threads/${thread.threadId}`"
            class="block px-4 py-3 transition-colors hover:bg-ctp-surface0/50"
          >
            <div class="flex items-start justify-between gap-2">
              <p class="min-w-0 flex-1 truncate text-sm font-medium text-ctp-text">{{ thread.subject || thread.summary }}</p>
              <span class="shrink-0 text-xs text-ctp-subtext0">
                {{ relTime(thread.lastSignalAt) }}
              </span>
            </div>
            <div class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ctp-subtext0">
              <span v-if="thread.senderAddress">From: {{ thread.senderAddress }}</span>
              <span v-if="thread.recipientAddress">To: {{ thread.recipientAddress }}</span>
              <span>{{ thread.workflow }}</span>
            </div>
            <div v-if="visibleLabels(thread.labels).length" class="mt-1 flex flex-wrap gap-1">
              <span
                v-for="label in visibleLabels(thread.labels)"
                :key="label"
                class="flex items-center gap-1 rounded bg-ctp-surface1 px-1.5 py-0.5 text-xs text-ctp-subtext0"
              >
                <span
                  v-if="labelMeta(label)"
                  class="h-2 w-2 shrink-0 rounded-full"
                  :style="{ backgroundColor: labelMeta(label)!.color }"
                />
                {{ labelMeta(label)?.name ?? label }}
              </span>
            </div>
          </RouterLink>
        </div>
      </section>

      <!-- Signals section -->
      <section v-if="visibleSections.has('signals') && results.signals.length > 0" class="mb-6">
        <h2 class="mb-2 text-xs font-semibold uppercase tracking-wide text-ctp-subtext0">
          Signals ({{ results.signals.length }})
        </h2>
        <div class="space-y-2">
          <div v-for="signal in results.signals" :key="signal.signalId">
            <!-- Collapsed card (clickable) -->
            <div
              v-if="!expandedSignals.has(signal.signalId)"
              class="cursor-pointer rounded-lg border border-ctp-surface0 px-4 py-3 transition-colors hover:bg-ctp-surface0/50"
              role="button"
              tabindex="0"
              @click="handleSignalClick(signal)"
              @keydown.enter="handleSignalClick(signal)"
            >
              <div class="flex items-start justify-between gap-2">
                <p class="min-w-0 flex-1 truncate text-sm font-medium text-ctp-text">{{ isEmailSignal(signal) ? signal.data.subject : signal.type }}</p>
                <span class="shrink-0 text-xs text-ctp-subtext0">
                  {{ relTime(signal.createdAt) }}
                </span>
              </div>
              <div class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ctp-subtext0">
                <span v-if="isEmailSignal(signal)">From: {{ signal.data.from.name || signal.data.from.address }}</span>
                <span v-if="isEmailSignal(signal) && 'recipientAddress' in signal.data">To: {{ signal.data.recipientAddress }}</span>
              </div>
              <div class="mt-1 flex items-center gap-2">
                <span
                  v-if="isBlockedSignal(signal)"
                  class="rounded bg-ctp-red/10 px-1.5 py-0.5 text-xs text-ctp-red"
                >{{ signal.status }}</span>
                <StatusBadge
                  v-else-if="signal.status.startsWith('quarantine')"
                  :status="signal.status as 'quarantine_visible' | 'quarantine_hidden'"
                />
              </div>
            </div>
            <!-- Expanded card (blocked signals only) -->
            <div v-else class="rounded-lg border border-ctp-surface0 p-2">
              <button
                class="mb-2 text-xs text-ctp-subtext0 hover:text-ctp-text"
                @click="expandedSignals.delete(signal.signalId)"
              >← Collapse</button>
              <SignalRenderer :signal="signal" />
            </div>
          </div>
        </div>
      </section>

      <!-- Aliases section -->
      <section v-if="visibleSections.has('aliases') && results.aliases.length > 0" class="mb-6">
        <h2 class="mb-2 text-xs font-semibold uppercase tracking-wide text-ctp-subtext0">
          Email addresses ({{ results.aliases.length }})
        </h2>
        <div class="divide-y divide-ctp-surface0 rounded-lg border border-ctp-surface0">
          <RouterLink
            v-for="alias in results.aliases"
            :key="alias.alias"
            to="/settings"
            class="flex items-center justify-between px-4 py-3 transition-colors hover:bg-ctp-surface0/50"
          >
            <p class="text-sm text-ctp-text">{{ alias.address }}</p>
            <span class="text-xs text-ctp-subtext0">{{ alias.unknownSenderPolicy }}</span>
          </RouterLink>
        </div>
      </section>

      <!-- Rules section -->
      <section v-if="visibleSections.has('rules') && results.rules.length > 0" class="mb-6">
        <h2 class="mb-2 text-xs font-semibold uppercase tracking-wide text-ctp-subtext0">
          Rules ({{ results.rules.length }})
        </h2>
        <div class="divide-y divide-ctp-surface0 rounded-lg border border-ctp-surface0">
          <RouterLink
            v-for="rule in results.rules"
            :key="rule.ruleId"
            :to="`/rules/${rule.ruleId}`"
            class="block px-4 py-3 transition-colors hover:bg-ctp-surface0/50"
          >
            <div class="flex flex-wrap items-center gap-1.5">
              <p class="text-sm font-medium text-ctp-text">{{ rule.name }}</p>
              <ActionBadge v-for="act in rule.actions" :key="act.type" :type="act.type" />
            </div>
          </RouterLink>
        </div>
      </section>

      <!-- Templates section -->
      <section v-if="visibleSections.has('templates') && results.templates.length > 0" class="mb-6">
        <h2 class="mb-2 text-xs font-semibold uppercase tracking-wide text-ctp-subtext0">
          Templates ({{ results.templates.length }})
        </h2>
        <div class="divide-y divide-ctp-surface0 rounded-lg border border-ctp-surface0">
          <RouterLink
            v-for="tpl in results.templates"
            :key="tpl.templateId"
            to="/templates"
            class="block px-4 py-3 transition-colors hover:bg-ctp-surface0/50"
          >
            <div class="flex items-center justify-between gap-2">
              <p class="text-sm font-medium text-ctp-text">{{ tpl.name }}</p>
              <span class="shrink-0 text-xs text-ctp-subtext0">
                {{ relTime(tpl.updatedAt) }}
              </span>
            </div>
            <p class="mt-0.5 text-xs text-ctp-subtext0">{{ tpl.subject }}</p>
          </RouterLink>
        </div>
      </section>
    </main>
  </div>
</template>

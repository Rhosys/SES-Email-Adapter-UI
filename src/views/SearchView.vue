<script setup lang="ts">
import { ref, computed, inject } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import { useAccountStore } from '@/stores/account'
import { api } from '@/lib/api'
import type { Arc, Rule, Signal } from '@/types/server'
import type { EmailAddressConfig } from '@/types/server'
import { useRelativeTime } from '@/composables/useRelativeTime'
import { formatRelativeTime } from '@/composables/useFormattedTime'
import { NOW_KEY } from '@/composables/useRelativeTime'

useRelativeTime()
const now = inject(NOW_KEY)

const route = useRoute()
const router = useRouter()
const accountStore = useAccountStore()

const query = ref((route.query.q as string) ?? '')
const searching = ref(false)

type SectionKey = 'arcs' | 'signals' | 'aliases' | 'rules'

const visibleSections = ref<Set<SectionKey>>(new Set(['arcs', 'signals', 'aliases', 'rules']))

const results = ref<{
  arcs: Arc[]
  signals: Signal[]
  aliases: EmailAddressConfig[]
  rules: Rule[]
  error: string | null
}>({ arcs: [], signals: [], aliases: [], rules: [], error: null })

const hasResults = computed(
  () =>
    results.value.arcs.length > 0 ||
    results.value.signals.length > 0 ||
    results.value.aliases.length > 0 ||
    results.value.rules.length > 0,
)

const searched = ref(false)

async function doSearch() {
  const q = query.value.trim()
  if (!q || !accountStore.accountId) return
  void router.replace({ path: '/search', query: { q } })

  searching.value = true
  searched.value = false
  results.value = { arcs: [], signals: [], aliases: [], rules: [], error: null }

  const id = accountStore.accountId

  const [arcsRes, aliasesRes, rulesRes] = await Promise.all([
    api.listArcs(id, { sender: q, limit: 20 }),
    api.listAliases(id),
    api.listRules(id),
  ])

  searching.value = false
  searched.value = true

  if (arcsRes.isOk()) {
    const ql = q.toLowerCase()
    results.value.arcs = arcsRes.value.items.filter(
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
      (r) => r.name.toLowerCase().includes(ql) || r.condition.toLowerCase().includes(ql),
    )
  }

  if (arcsRes.isErr() || aliasesRes.isErr() || rulesRes.isErr()) {
    results.value.error =
      (arcsRes.isErr() && arcsRes.error.message) ||
      (aliasesRes.isErr() && aliasesRes.error.message) ||
      (rulesRes.isErr() && rulesRes.error.message) ||
      'Search failed'
  }
}

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
</script>

<template>
  <div>
    <header class="border-b border-ctp-surface0 bg-ctp-mantle px-4 py-3">
      <h1 class="text-lg font-semibold">Search</h1>
    </header>

    <main class="mx-auto max-w-3xl px-4 py-6">
      <!-- Search input -->
      <form class="mb-6 flex gap-2" @submit.prevent="doSearch">
        <input
          v-model="query"
          type="search"
          placeholder="Search arcs, signals, aliases, rules…"
          class="flex-1 rounded-lg border border-ctp-surface1 bg-ctp-mantle px-4 py-2 text-sm text-ctp-text placeholder:text-ctp-subtext0 focus:border-ctp-mauve focus:outline-none"
          autofocus
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
            { key: 'arcs' as SectionKey, label: 'Arcs', count: results.arcs.length },
            { key: 'signals' as SectionKey, label: 'Signals', count: results.signals.length },
            { key: 'aliases' as SectionKey, label: 'Addresses', count: results.aliases.length },
            { key: 'rules' as SectionKey, label: 'Rules', count: results.rules.length },
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

      <!-- Arcs section -->
      <section v-if="visibleSections.has('arcs') && results.arcs.length > 0" class="mb-6">
        <h2 class="mb-2 text-xs font-semibold uppercase tracking-wide text-ctp-subtext0">
          Arcs ({{ results.arcs.length }})
        </h2>
        <div class="divide-y divide-ctp-surface0 rounded-lg border border-ctp-surface0">
          <RouterLink
            v-for="arc in results.arcs"
            :key="arc.id"
            :to="`/arcs/${arc.id}`"
            class="block px-4 py-3 transition-colors hover:bg-ctp-surface0/50"
          >
            <div class="flex items-start justify-between gap-2">
              <p class="text-sm font-medium text-ctp-text">{{ arc.summary }}</p>
              <span class="shrink-0 text-xs text-ctp-subtext0">
                {{ relTime(arc.lastSignalAt) }}
              </span>
            </div>
            <p class="mt-0.5 text-xs text-ctp-subtext0">{{ arc.workflow }}</p>
          </RouterLink>
        </div>
      </section>

      <!-- Signals section -->
      <section v-if="visibleSections.has('signals') && results.signals.length > 0" class="mb-6">
        <h2 class="mb-2 text-xs font-semibold uppercase tracking-wide text-ctp-subtext0">
          Signals ({{ results.signals.length }})
        </h2>
        <div class="divide-y divide-ctp-surface0 rounded-lg border border-ctp-surface0">
          <div v-for="signal in results.signals" :key="signal.id" class="px-4 py-3">
            <div class="flex items-start justify-between gap-2">
              <p class="text-sm font-medium text-ctp-text">{{ signal.subject }}</p>
              <span class="shrink-0 text-xs text-ctp-subtext0">
                {{ relTime(signal.receivedAt) }}
              </span>
            </div>
            <p class="mt-0.5 text-xs text-ctp-subtext0">
              From: {{ signal.from.name || signal.from.address }}
            </p>
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
            :key="alias.id"
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
            :key="rule.id"
            :to="`/rules/${rule.id}`"
            class="block px-4 py-3 transition-colors hover:bg-ctp-surface0/50"
          >
            <div class="flex items-center justify-between gap-2">
              <p class="text-sm font-medium text-ctp-text">{{ rule.name }}</p>
              <span class="rounded bg-ctp-surface1 px-2 py-0.5 text-xs text-ctp-subtext0">
                {{ rule.actions[0]?.type ?? '—' }}
              </span>
            </div>
            <p class="mt-0.5 font-mono text-xs text-ctp-subtext0">
              {{ rule.condition }}
            </p>
          </RouterLink>
        </div>
      </section>
    </main>
  </div>
</template>

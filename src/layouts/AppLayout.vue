<script setup lang="ts">
import { ref, watch, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAccountStore } from '@/stores/account'
import { useLabelsStore } from '@/stores/labels'
import { useViewsStore } from '@/stores/views'
import { api } from '@/lib/api'
import type { Arc, Rule, EmailAddressConfig } from '@/types/server'
import AppSidebar from '@/components/AppSidebar.vue'

const accountStore = useAccountStore()
const labelsStore = useLabelsStore()
const viewsStore = useViewsStore()
const router = useRouter()
const route = useRoute()

const searchQuery = ref('')
const inputFocused = ref(false)
const hasSearched = ref(false)

type SectionKey = 'arcs' | 'senders' | 'aliases' | 'rules'

const CATEGORIES: { key: SectionKey; label: string }[] = [
  { key: 'arcs', label: 'Arcs' },
  { key: 'senders', label: 'Senders' },
  { key: 'aliases', label: 'Aliases' },
  { key: 'rules', label: 'Rules' },
]

const activeCategories = ref<Set<SectionKey>>(new Set(['arcs', 'senders', 'aliases', 'rules']))

const suggestions = ref<{
  arcs: Arc[]
  senders: string[]
  aliases: EmailAddressConfig[]
  rules: Rule[]
  loading: boolean
}>({ arcs: [], senders: [], aliases: [], rules: [], loading: false })

const ACTION_COLORS: Record<string, string> = {
  allow: 'text-ctp-green bg-ctp-green/10',
  block: 'text-ctp-red bg-ctp-red/10',
  label: 'text-ctp-blue bg-ctp-blue/10',
  quarantine: 'text-ctp-peach bg-ctp-peach/10',
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null
let activeQuery = ''

const dropdownOpen = computed(
  () => inputFocused.value && searchQuery.value.trim().length >= 2 && route.path !== '/search',
)

const hasVisibleResults = computed(
  () =>
    (activeCategories.value.has('arcs') && suggestions.value.arcs.length > 0) ||
    (activeCategories.value.has('senders') && suggestions.value.senders.length > 0) ||
    (activeCategories.value.has('aliases') && suggestions.value.aliases.length > 0) ||
    (activeCategories.value.has('rules') && suggestions.value.rules.length > 0),
)

// Sync input with /search route
watch(
  () => route.query.q,
  (q) => {
    if (route.path === '/search') searchQuery.value = (q as string) ?? ''
    else searchQuery.value = ''
  },
)

// Lookahead on input change
watch(searchQuery, (q) => {
  if (debounceTimer) clearTimeout(debounceTimer)
  const trimmed = q.trim()
  if (trimmed.length < 2) {
    hasSearched.value = false
    suggestions.value = { arcs: [], senders: [], aliases: [], rules: [], loading: false }
    return
  }
  suggestions.value.loading = true
  hasSearched.value = false
  debounceTimer = setTimeout(() => void fetchSuggestions(trimmed), 250)
})

async function fetchSuggestions(q: string) {
  if (!accountStore.accountId) return
  activeQuery = q
  const id = accountStore.accountId
  const ql = q.toLowerCase()

  const [arcsRes, aliasesRes, rulesRes] = await Promise.all([
    api.listArcs(id, { sender: q, limit: 8 }),
    api.listAliases(id),
    api.listRules(id),
  ])

  if (activeQuery !== q) return

  suggestions.value.loading = false
  hasSearched.value = true

  suggestions.value.arcs = arcsRes.isOk()
    ? arcsRes.value.items
        .filter(
          (a) =>
            a.summary?.toLowerCase().includes(ql) ||
            a.labels?.some((l) => l.toLowerCase().includes(ql)),
        )
        .slice(0, 4)
    : []

  suggestions.value.senders = aliasesRes.isOk()
    ? [...new Set(aliasesRes.value.flatMap((a) => a.approvedSenders))]
        .filter((s) => s.toLowerCase().includes(ql))
        .slice(0, 4)
    : []

  suggestions.value.aliases = aliasesRes.isOk()
    ? aliasesRes.value.filter((a) => a.address.toLowerCase().includes(ql)).slice(0, 3)
    : []

  suggestions.value.rules = rulesRes.isOk()
    ? rulesRes.value
        .filter(
          (r) =>
            r.name.toLowerCase().includes(ql) ||
            r.conditions.some((c) => c.value.toLowerCase().includes(ql)),
        )
        .slice(0, 3)
    : []
}

function toggleCategory(key: SectionKey) {
  if (activeCategories.value.has(key)) {
    if (activeCategories.value.size > 1) activeCategories.value.delete(key)
  } else {
    activeCategories.value.add(key)
  }
}

function onInputBlur() {
  setTimeout(() => {
    inputFocused.value = false
  }, 150)
}

function onInputFocus() {
  inputFocused.value = true
}

function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    inputFocused.value = false
    ;(e.target as HTMLInputElement).blur()
  }
}

function selectArc(arc: Arc) {
  searchQuery.value = ''
  inputFocused.value = false
  void router.push(`/arcs/${arc.id}`)
}

function selectSender(address: string) {
  searchQuery.value = ''
  inputFocused.value = false
  void router.push({ path: '/', query: { sender: address } })
}

function selectAlias() {
  searchQuery.value = ''
  inputFocused.value = false
  void router.push('/settings')
}

function selectRule(rule: Rule) {
  searchQuery.value = ''
  inputFocused.value = false
  void router.push(`/rules/${rule.id}`)
}

function submitSearch() {
  inputFocused.value = false
  const q = searchQuery.value.trim()
  if (!q) return
  void router.push({ path: '/search', query: { q } })
}

onMounted(async () => {
  if (!accountStore.account) {
    await accountStore.fetchAccount()
  }
  if (accountStore.accountId) {
    await Promise.all([
      labelsStore.fetchLabels(accountStore.accountId),
      viewsStore.fetchViews(accountStore.accountId),
    ])
  }
})
</script>

<template>
  <div class="flex h-screen overflow-hidden bg-ctp-base text-ctp-text">
    <AppSidebar />
    <div class="flex flex-1 flex-col overflow-hidden">
      <!-- Top search bar -->
      <header
        class="flex h-11 shrink-0 items-center border-b border-ctp-surface0 bg-ctp-mantle px-4"
      >
        <form class="flex w-full max-w-xl items-center gap-2" @submit.prevent="submitSearch">
          <div class="relative flex-1">
            <svg
              class="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ctp-subtext0"
              viewBox="0 0 16 16"
              fill="currentColor"
            >
              <path
                d="M11.742 10.344a6.5 6.5 0 10-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 001.415-1.414l-3.85-3.85a1.007 1.007 0 00-.115-.099zm-5.242 1.156a5.5 5.5 0 110-11 5.5 5.5 0 010 11z"
              />
            </svg>
            <input
              v-model="searchQuery"
              type="search"
              placeholder="Search…"
              class="h-7 w-full rounded-md border border-ctp-surface1 bg-ctp-base pl-8 pr-3 text-sm text-ctp-text placeholder:text-ctp-subtext0 focus:border-ctp-mauve focus:outline-none"
              autocomplete="off"
              @focus="onInputFocus"
              @blur="onInputBlur"
              @keydown="onKeyDown"
            />

            <!-- Lookahead dropdown -->
            <div
              v-if="dropdownOpen"
              class="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-lg border border-ctp-surface1 bg-ctp-mantle shadow-lg"
            >
              <!-- Category toggles -->
              <div
                class="flex items-center gap-1.5 border-b border-ctp-surface0 bg-ctp-base/40 px-3 py-2"
              >
                <span class="mr-0.5 text-xs text-ctp-subtext0">Show:</span>
                <button
                  v-for="cat in CATEGORIES"
                  :key="cat.key"
                  type="button"
                  class="rounded-full border px-2.5 py-0.5 text-xs transition-colors"
                  :class="
                    activeCategories.has(cat.key)
                      ? 'border-ctp-mauve bg-ctp-mauve/10 text-ctp-mauve'
                      : 'border-ctp-surface1 text-ctp-subtext0 hover:border-ctp-surface2 hover:text-ctp-text'
                  "
                  :disabled="activeCategories.has(cat.key) && activeCategories.size === 1"
                  @mousedown.prevent="toggleCategory(cat.key)"
                >
                  {{ cat.label }}
                </button>
              </div>

              <!-- Loading -->
              <div v-if="suggestions.loading" class="px-4 py-3 text-sm text-ctp-subtext0">
                Searching…
              </div>

              <template v-else-if="hasSearched">
                <!-- No results -->
                <div v-if="!hasVisibleResults" class="px-4 py-3 text-sm text-ctp-subtext0">
                  No matches
                </div>

                <template v-else>
                  <!-- Arcs -->
                  <template v-if="activeCategories.has('arcs') && suggestions.arcs.length">
                    <div
                      class="border-b border-ctp-surface0 bg-ctp-base/40 px-3 py-1 text-xs font-medium uppercase tracking-wide text-ctp-subtext0"
                    >
                      Arcs
                    </div>
                    <button
                      v-for="arc in suggestions.arcs"
                      :key="arc.id"
                      type="button"
                      class="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-ctp-surface0"
                      @mousedown.prevent="selectArc(arc)"
                    >
                      <span class="flex-1 truncate text-sm text-ctp-text">{{ arc.summary }}</span>
                      <span class="shrink-0 text-xs text-ctp-subtext0">{{ arc.workflow }}</span>
                    </button>
                  </template>

                  <!-- Senders -->
                  <template v-if="activeCategories.has('senders') && suggestions.senders.length">
                    <div
                      class="border-y border-ctp-surface0 bg-ctp-base/40 px-3 py-1 text-xs font-medium uppercase tracking-wide text-ctp-subtext0"
                      :class="{
                        'border-t-0': !suggestions.arcs.length || !activeCategories.has('arcs'),
                      }"
                    >
                      Senders
                    </div>
                    <button
                      v-for="sender in suggestions.senders"
                      :key="sender"
                      type="button"
                      class="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-ctp-surface0"
                      @mousedown.prevent="selectSender(sender)"
                    >
                      <svg
                        class="h-3.5 w-3.5 shrink-0 text-ctp-subtext0"
                        viewBox="0 0 16 16"
                        fill="currentColor"
                      >
                        <path
                          d="M8 8a3 3 0 100-6 3 3 0 000 6zm2-3a2 2 0 11-4 0 2 2 0 014 0zm4 8c0 1-1 1-1 1H3s-1 0-1-1 1-4 6-4 6 3 6 4zm-1-.004c-.001-.246-.154-.986-.832-1.664C11.516 10.68 10.029 10 8 10c-2.029 0-3.516.68-4.168 1.332-.678.678-.83 1.418-.832 1.664h10z"
                        />
                      </svg>
                      <span class="flex-1 truncate text-sm text-ctp-text">{{ sender }}</span>
                    </button>
                  </template>

                  <!-- Aliases -->
                  <template v-if="activeCategories.has('aliases') && suggestions.aliases.length">
                    <div
                      class="border-y border-ctp-surface0 bg-ctp-base/40 px-3 py-1 text-xs font-medium uppercase tracking-wide text-ctp-subtext0"
                      :class="{
                        'border-t-0':
                          (!suggestions.arcs.length || !activeCategories.has('arcs')) &&
                          (!suggestions.senders.length || !activeCategories.has('senders')),
                      }"
                    >
                      Aliases
                    </div>
                    <button
                      v-for="alias in suggestions.aliases"
                      :key="alias.id"
                      type="button"
                      class="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-ctp-surface0"
                      @mousedown.prevent="selectAlias"
                    >
                      <span class="flex-1 truncate text-sm text-ctp-text">{{ alias.address }}</span>
                      <span class="shrink-0 text-xs text-ctp-subtext0">{{ alias.filterMode }}</span>
                    </button>
                  </template>

                  <!-- Rules -->
                  <template v-if="activeCategories.has('rules') && suggestions.rules.length">
                    <div
                      class="border-y border-ctp-surface0 bg-ctp-base/40 px-3 py-1 text-xs font-medium uppercase tracking-wide text-ctp-subtext0"
                      :class="{
                        'border-t-0':
                          (!suggestions.arcs.length || !activeCategories.has('arcs')) &&
                          (!suggestions.senders.length || !activeCategories.has('senders')) &&
                          (!suggestions.aliases.length || !activeCategories.has('aliases')),
                      }"
                    >
                      Rules
                    </div>
                    <button
                      v-for="rule in suggestions.rules"
                      :key="rule.id"
                      type="button"
                      class="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-ctp-surface0"
                      @mousedown.prevent="selectRule(rule)"
                    >
                      <span class="flex-1 truncate text-sm text-ctp-text">{{ rule.name }}</span>
                      <span
                        class="shrink-0 rounded px-1.5 py-0.5 text-xs"
                        :class="ACTION_COLORS[rule.action] ?? 'bg-ctp-surface1 text-ctp-subtext0'"
                      >
                        {{ rule.action }}
                      </span>
                    </button>
                  </template>
                </template>
              </template>

              <!-- See all -->
              <div class="border-t border-ctp-surface0">
                <button
                  type="button"
                  class="flex w-full items-center justify-between px-4 py-2.5 text-sm text-ctp-mauve transition-colors hover:bg-ctp-surface0"
                  @mousedown.prevent="submitSearch"
                >
                  <span>See all results for "{{ searchQuery.trim() }}"</span>
                  <span aria-hidden="true">→</span>
                </button>
              </div>
            </div>
          </div>
        </form>
      </header>

      <div class="flex-1 overflow-y-auto">
        <RouterView />
      </div>
    </div>
  </div>
</template>

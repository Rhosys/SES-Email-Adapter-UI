<script setup lang="ts">
import { ref, watch, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAccountStore } from '@/stores/account'
import { useLabelsStore } from '@/stores/labels'
import { useViewsStore } from '@/stores/views'
import { api } from '@/lib/api'
import type { Arc, Rule, Alias } from '@/types/server'
import AppSidebar from '@/components/AppSidebar.vue'
import AppNavbar from '@/components/AppNavbar.vue'
import ToastStack from '@/components/ToastStack.vue'
import FeatureTour from '@/components/FeatureTour.vue'
import OnboardingCoach from '@/components/OnboardingCoach.vue'
import ShortcutHelpOverlay from '@/components/ShortcutHelpOverlay.vue'
import { useRealtime } from '@/composables/useRealtime'
import { useFeatureTour } from '@/composables/useFeatureTour'
import { useOnboardingCoach } from '@/composables/useOnboardingCoach'
import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts'
import { useRelativeTime } from '@/composables/useRelativeTime'

useRelativeTime()

const accountStore = useAccountStore()
const labelsStore = useLabelsStore()
const viewsStore = useViewsStore()
const router = useRouter()
const route = useRoute()

const { startTour } = useFeatureTour()
const { coachVisible } = useOnboardingCoach()
const { init: initShortcuts, onAction, setBlocked } = useKeyboardShortcuts()
useRealtime()

const searchQuery = ref('')
const inputFocused = ref(false)
const shortcutHelpOpen = ref(false)
const searchInput = ref<HTMLInputElement | null>(null)
const hasSearched = ref(false)
const sidebarOpen = ref(false)

// ── Edge swipe to open/close sidebar (mobile) ─────────────────────────────────
let swipeStartX = 0
let swipeStartY = 0
let swipeStartTime = 0
let swipeTracking = false

function onMainTouchStart(e: TouchEvent) {
  if (e.touches.length !== 1) return
  const t = e.touches[0]
  swipeStartX = t.clientX
  swipeStartY = t.clientY
  swipeStartTime = Date.now()
  // Track if touch starts within 30px of left edge (to open) or anywhere (to close)
  swipeTracking = swipeStartX < 30 || sidebarOpen.value
}

function onMainTouchEnd(e: TouchEvent) {
  if (!swipeTracking || e.changedTouches.length !== 1) return
  swipeTracking = false
  const t = e.changedTouches[0]
  const dx = t.clientX - swipeStartX
  const dy = t.clientY - swipeStartY
  const elapsed = Date.now() - swipeStartTime
  if (elapsed > 300 || Math.abs(dx) < 50 || Math.abs(dy) > Math.abs(dx)) return
  // Only apply on mobile (< 640px)
  if (window.innerWidth >= 640) return
  if (dx > 0 && swipeStartX < 30 && !sidebarOpen.value) {
    sidebarOpen.value = true
  } else if (dx < 0 && sidebarOpen.value) {
    sidebarOpen.value = false
  }
}

// Close sidebar on navigation (mobile)
watch(
  () => route.path,
  () => {
    sidebarOpen.value = false
  },
)

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
  aliases: Alias[]
  rules: Rule[]
  loading: boolean
}>({ arcs: [], senders: [], aliases: [], rules: [], loading: false })

const ACTION_COLORS: Record<string, string> = {
  block: 'text-ctp-red bg-ctp-red/10',
  delete: 'text-ctp-red bg-ctp-red/10',
  quarantine: 'text-ctp-peach bg-ctp-peach/10',
  quarantine_hidden: 'text-ctp-peach bg-ctp-peach/10',
  assign_label: 'text-ctp-blue bg-ctp-blue/10',
  approve_sender: 'text-ctp-green bg-ctp-green/10',
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
    ? arcsRes.value.arcs
        .filter(
          (a: Arc) =>
            a.summary?.toLowerCase().includes(ql) ||
            a.labels?.some((l: string) => l.toLowerCase().includes(ql)),
        )
        .slice(0, 4)
    : []

  // Sender suggestions are now managed via /aliases/:address/senders sub-resource;
  // not aggregated here to avoid N+1 calls
  suggestions.value.senders = []

  suggestions.value.aliases = aliasesRes.isOk()
    ? aliasesRes.value.filter((a) => a.address.toLowerCase().includes(ql)).slice(0, 3)
    : []

  suggestions.value.rules = rulesRes.isOk()
    ? rulesRes.value
        .filter((r) => r.name.toLowerCase().includes(ql) || (r.condition ?? '').toLowerCase().includes(ql))
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
  void router.push(`/arcs/${arc.arcId}`)
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
  void router.push(`/rules/${rule.ruleId}`)
}

function submitSearch() {
  inputFocused.value = false
  const q = searchQuery.value.trim()
  if (!q) return
  void router.push({ path: '/search', query: { q } })
}

watch(shortcutHelpOpen, (open) => setBlocked(open))

function focusSearch() {
  searchInput.value?.focus()
  searchInput.value?.select()
}

onMounted(async () => {
  if (!accountStore.account) {
    const fromUrl = route.query.accountId as string | undefined
    await accountStore.fetchAccount(fromUrl)
    if (fromUrl) {
      void router.replace({
        path: route.path,
        query: Object.fromEntries(Object.entries(route.query).filter(([k]) => k !== 'accountId')),
        hash: route.hash,
      })
    }
  }
  await Promise.all([labelsStore.fetchLabels(), viewsStore.fetchViews()])

  // Auto-start the feature tour only after the notification coach has been shown
  // (the coach itself starts the tour as its final step for fresh users)
  const ob = accountStore.account?.onboarding
  if (ob?.completed) {
    startTour()
  }

  // Initialize global keyboard shortcut listener
  initShortcuts()
  onAction('shortcut_help', () => {
    shortcutHelpOpen.value = !shortcutHelpOpen.value
  })
  onAction('search', focusSearch)
  onAction('go_inbox', () => void router.push({ name: 'inbox' }))
  onAction('go_quarantine', () => void router.push({ name: 'quarantine' }))
  onAction('go_labels', () => void router.push({ name: 'labels' }))
  onAction('go_rules', () => void router.push({ name: 'rules' }))
  onAction('go_settings', () => void router.push({ name: 'settings' }))
  onAction('go_profile', () => void router.push({ name: 'profile' }))
})
</script>

<template>
  <div class="flex h-screen overflow-hidden bg-ctp-base text-ctp-text">
    <!-- Skip to main content -->
    <a
      href="#main-content"
      class="absolute left-2 top-2 z-[100] -translate-y-20 rounded bg-ctp-mauve px-3 py-1.5 text-sm font-medium text-ctp-base focus:translate-y-0"
    >Skip to content</a>

    <!-- Backdrop for mobile sidebar -->
    <div
      v-if="sidebarOpen"
      role="presentation"
      class="fixed inset-0 z-30 bg-black/50 sm:hidden"
      @click="sidebarOpen = false"
    />

    <AppSidebar :open="sidebarOpen" />

    <div
      class="flex min-w-0 flex-1 flex-col overflow-hidden"
      @touchstart.passive="onMainTouchStart"
      @touchend="onMainTouchEnd"
    >
      <AppNavbar show-hamburger @toggle-sidebar="sidebarOpen = !sidebarOpen">
        <template #search>
          <form class="flex w-full max-w-xl items-center gap-2" @submit.prevent="submitSearch">
          <div class="relative flex-1">
            <svg
              class="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ctp-subtext0"
              viewBox="0 0 16 16"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                d="M11.742 10.344a6.5 6.5 0 10-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 001.415-1.414l-3.85-3.85a1.007 1.007 0 00-.115-.099zm-5.242 1.156a5.5 5.5 0 110-11 5.5 5.5 0 010 11z"
              />
            </svg>
            <input
              ref="searchInput"
              v-model="searchQuery"
              type="search"
              aria-label="Search arcs, rules, aliases"
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
                  :aria-pressed="activeCategories.has(cat.key)"
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
                      :key="arc.arcId"
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
                      :key="alias.alias"
                      type="button"
                      class="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-ctp-surface0"
                      @mousedown.prevent="selectAlias"
                    >
                      <span class="flex-1 truncate text-sm text-ctp-text">{{ alias.address }}</span>
                      <span class="shrink-0 text-xs text-ctp-subtext0">{{ alias.unknownSenderPolicy }}</span>
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
                      :key="rule.ruleId"
                      type="button"
                      class="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-ctp-surface0"
                      @mousedown.prevent="selectRule(rule)"
                    >
                      <span class="flex-1 truncate text-sm text-ctp-text">{{ rule.name }}</span>
                      <span
                        class="shrink-0 rounded px-1.5 py-0.5 text-xs"
                        :class="
                          ACTION_COLORS[rule.actions[0]?.type] ??
                          'bg-ctp-surface1 text-ctp-subtext0'
                        "
                      >
                        {{ rule.actions[0]?.type ?? '—' }}
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
        </template>
      </AppNavbar>

      <div id="main-content" class="flex-1 overflow-y-auto">
        <RouterView />
      </div>
    </div>
  </div>

  <ToastStack />
  <FeatureTour />
  <OnboardingCoach v-if="coachVisible" />
  <ShortcutHelpOverlay v-model:open="shortcutHelpOpen" />
</template>

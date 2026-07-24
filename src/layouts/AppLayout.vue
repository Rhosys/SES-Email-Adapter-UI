<script setup lang="ts">
import { ref, watch, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useLabelsStore } from '@/stores/labels'
import { useViewsStore } from '@/stores/views'
import type { Thread, Rule, EmailTemplate } from '@/types/server'
import AppSidebar from '@/components/AppSidebar.vue'
import AppNavbar from '@/components/AppNavbar.vue'
import SearchInputShell, { SEARCH_FIELD_CLASS } from '@/components/SearchInputShell.vue'
import ActionBadge from '@/components/ActionBadge.vue'
import ToastStack from '@/components/ToastStack.vue'
import FeatureTour from '@/components/FeatureTour.vue'
import OnboardingCoach from '@/components/OnboardingCoach.vue'
import ShortcutHelpOverlay from '@/components/ShortcutHelpOverlay.vue'
import { useRealtime } from '@/composables/useRealtime'
import { useOnboardingCoach } from '@/composables/useOnboardingCoach'
import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts'
import { useRelativeTime } from '@/composables/useRelativeTime'
import { useSearch } from '@/composables/useSearch'
import { useFeatureTour } from '@/composables/useFeatureTour'
import { useIsMobile } from '@/composables/useIsMobile'
import { settingsTabLabel, resolveSettingsTab } from '@/lib/settingsTabs'

useRelativeTime()

const labelsStore = useLabelsStore()
const viewsStore = useViewsStore()
const router = useRouter()
const route = useRoute()

// ── Mobile Settings header: back button + "{Tab}" title replace the
// hamburger + search facade (Settings owns its own bottom tab bar instead). ──
const isMobileSettings = computed(() => route.name === 'settings')
const mobileSettingsTitle = computed(() =>
  settingsTabLabel(resolveSettingsTab(route.query.tab as string | undefined)),
)

function handleMobileBack() {
  // router.back() falls through to whatever the browser was on before the app
  // if this is the first entry in the SPA's history (e.g. a direct/deep link
  // to /settings) — fall back to the inbox in that case instead of leaving.
  if (window.history.state?.back) {
    router.back()
  } else {
    void router.push('/')
  }
}

const { coachVisible } = useOnboardingCoach()
const { init: initShortcuts, onAction, setBlocked, shortcutHelpOpen } = useKeyboardShortcuts()
useRealtime()

const { query: searchQuery, results, loading, searched, onPaste: handlePaste } = useSearch({ mode: 'typeahead' })
const inputFocused = ref(false)
const searchInput = ref<HTMLInputElement | null>(null)
const sidebarOpen = ref(false)

// ── Open the sidebar before the feature tour starts, on mobile ────────────────
// The tour's first spotlight target (nav-inbox) lives in the off-canvas
// sidebar on mobile — without this its box would land on the translated,
// off-screen element. isMobile must be called before the onMounted() below so
// its own onMounted (which syncs the initial matchMedia value) is registered,
// and therefore runs, first.
const { tourActive } = useFeatureTour()
const isMobile = useIsMobile()

function openSidebarForMobileTour() {
  if (tourActive.value && isMobile.value) sidebarOpen.value = true
}

watch(tourActive, openSidebarForMobileTour)

onMounted(() => {
  // Covers startTour() having been called before this component ever
  // mounted (OnboardingView.vue's completion flow — a top-level route
  // rendered outside AppLayout) — tourActive is already true here, so the
  // watch() above never fires for it on its own (it only reacts to changes).
  // A separate, synchronous onMounted (rather than folding this into the
  // async one below) so it isn't delayed behind that one's network awaits.
  openSidebarForMobileTour()
})

// ── Notification click routing ─────────────────────────────────────────────
// When a notification is clicked and an app window is already open, src/sw.ts
// focuses it and posts the target path here, rather than navigating the SW's
// own (non-existent) location — a service worker has no window to route.
onMounted(() => {
  if (!('serviceWorker' in navigator)) return
  navigator.serviceWorker.addEventListener('message', (event: MessageEvent) => {
    const data = event.data as { type?: string; url?: string } | undefined
    if (data?.type === 'notification-navigate' && data.url) {
      void router.push(data.url)
    }
  })
})

// ── Swipe to open/close sidebar (mobile) ──────────────────────────────────────
// Swipe-right anywhere opens the nav; swipe-left closes it. A region can claim
// horizontal swipes for itself via `data-h-swipe` (e.g. the Settings tab strip,
// a zoomed email) — we skip those, except a swipe from the very left edge, which
// always opens the nav so the user can never get trapped.
const EDGE_ZONE = 30
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

  if (sidebarOpen.value) {
    swipeTracking = true // allow swipe-left to close from anywhere
    return
  }
  const ownedByRegion = !!(e.target as Element | null)?.closest?.('[data-h-swipe]')
  swipeTracking = swipeStartX < EDGE_ZONE || !ownedByRegion
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
  if (dx > 0 && !sidebarOpen.value) {
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

const dropdownOpen = computed(
  () => inputFocused.value && searchQuery.value.trim().length >= 3 && route.path !== '/search',
)

const hasVisibleResults = computed(
  () =>
    results.value.threads.length > 0 ||
    results.value.aliases.length > 0 ||
    results.value.rules.length > 0 ||
    results.value.templates.length > 0,
)

// Sync input with /search route
watch(
  () => route.query.q,
  (q) => {
    if (route.path === '/search') searchQuery.value = (q as string) ?? ''
    else searchQuery.value = ''
  },
)

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

function selectThread(thread: Thread) {
  searchQuery.value = ''
  inputFocused.value = false
  void router.push(`/threads/${thread.threadId}`)
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

function selectTemplate(template: EmailTemplate) {
  searchQuery.value = ''
  inputFocused.value = false
  void router.push(`/templates/${template.templateId}`)
}

function submitSearch() {
  inputFocused.value = false
  const q = searchQuery.value.trim()
  if (!q) return
  void router.push({ path: '/search', query: { q } })
}

function onNavbarPaste(e: ClipboardEvent) {
  handlePaste(e)
}

watch(shortcutHelpOpen, (open) => setBlocked(open))

function focusSearch() {
  searchInput.value?.focus()
  searchInput.value?.select()
}

onMounted(async () => {
  await Promise.all([labelsStore.fetchLabels(), viewsStore.fetchViews()])

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
  <div
    class="flex h-dvh overflow-hidden bg-ctp-base text-ctp-text"
    @touchstart.passive="onMainTouchStart"
    @touchend="onMainTouchEnd"
  >
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

    <div class="flex min-w-0 flex-1 flex-col overflow-hidden">
      <AppNavbar
        show-hamburger
        :mobile-back="isMobileSettings"
        @toggle-sidebar="sidebarOpen = !sidebarOpen"
        @back="handleMobileBack"
      >
        <template #search>
          <!-- Desktop: interactive typeahead (sm and up), unchanged on Settings too. -->
          <form v-if="route.path !== '/search'" class="hidden w-full max-w-xl items-center gap-2 sm:flex" @submit.prevent="submitSearch">
          <SearchInputShell>
            <input
              ref="searchInput"
              v-model="searchQuery"
              type="search"
              aria-label="Search threads, rules, aliases"
              placeholder="Search…"
              maxlength="64"
              :class="SEARCH_FIELD_CLASS"
              autocomplete="off"
              @focus="onInputFocus"
              @blur="onInputBlur"
              @keydown="onKeyDown"
              @paste="onNavbarPaste"
            />

            <!-- Lookahead dropdown -->
            <div
              v-if="dropdownOpen"
              class="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-lg border border-ctp-surface1 bg-ctp-mantle shadow-lg"
            >
              <!-- Loading -->
              <div v-if="loading" class="px-4 py-3 text-sm text-ctp-subtext0">
                Searching…
              </div>

              <template v-else-if="searched">
                <!-- No results -->
                <div v-if="!hasVisibleResults" class="px-4 py-3 text-sm text-ctp-subtext0">
                  No matches
                </div>

                <template v-else>
                  <!-- Threads -->
                  <template v-if="results.threads.length">
                    <div
                      class="border-b border-ctp-surface0 bg-ctp-base/40 px-3 py-1 text-xs font-medium uppercase tracking-wide text-ctp-subtext0"
                    >
                      Threads
                    </div>
                    <button
                      v-for="thread in results.threads"
                      :key="thread.threadId"
                      type="button"
                      class="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-ctp-surface0"
                      @mousedown.prevent="selectThread(thread)"
                    >
                      <span class="flex-1 truncate text-sm text-ctp-text">{{ thread.summary }}</span>
                      <span class="shrink-0 text-xs text-ctp-subtext0">{{ thread.workflow }}</span>
                    </button>
                  </template>

                  <!-- Aliases -->
                  <template v-if="results.aliases.length">
                    <div
                      class="border-y border-ctp-surface0 bg-ctp-base/40 px-3 py-1 text-xs font-medium uppercase tracking-wide text-ctp-subtext0"
                      :class="{ 'border-t-0': !results.threads.length }"
                    >
                      Aliases
                    </div>
                    <button
                      v-for="alias in results.aliases"
                      :key="alias.alias"
                      type="button"
                      class="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-ctp-surface0"
                      @mousedown.prevent="selectAlias"
                    >
                      <span class="flex-1 truncate text-sm text-ctp-text">{{ alias.alias }}</span>
                      <span class="shrink-0 text-xs text-ctp-subtext0">{{ alias.unknownSenderPolicy }}</span>
                    </button>
                  </template>

                  <!-- Rules -->
                  <template v-if="results.rules.length">
                    <div
                      class="border-y border-ctp-surface0 bg-ctp-base/40 px-3 py-1 text-xs font-medium uppercase tracking-wide text-ctp-subtext0"
                      :class="{ 'border-t-0': !results.threads.length && !results.aliases.length }"
                    >
                      Rules
                    </div>
                    <button
                      v-for="rule in results.rules"
                      :key="rule.ruleId"
                      type="button"
                      class="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-ctp-surface0"
                      @mousedown.prevent="selectRule(rule)"
                    >
                      <span class="flex-1 truncate text-sm text-ctp-text">{{ rule.name }}</span>
                      <ActionBadge v-if="rule.actions[0]" class="shrink-0" :type="rule.actions[0].type" />
                      <span v-else class="shrink-0 rounded px-1.5 py-0.5 text-xs bg-ctp-surface1 text-ctp-subtext0">—</span>
                    </button>
                  </template>

                  <!-- Templates -->
                  <template v-if="results.templates.length">
                    <div
                      class="border-y border-ctp-surface0 bg-ctp-base/40 px-3 py-1 text-xs font-medium uppercase tracking-wide text-ctp-subtext0"
                      :class="{ 'border-t-0': !results.threads.length && !results.aliases.length && !results.rules.length }"
                    >
                      Templates
                    </div>
                    <button
                      v-for="template in results.templates"
                      :key="template.templateId"
                      type="button"
                      class="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-ctp-surface0"
                      @mousedown.prevent="selectTemplate(template)"
                    >
                      <span class="flex-1 truncate text-sm text-ctp-text">{{ template.name }}</span>
                      <span class="shrink-0 truncate text-xs text-ctp-subtext0 max-w-[200px]">{{ template.subject }}</span>
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
          </SearchInputShell>
        </form>

          <!-- Mobile Settings: the current tab's name, replacing search. -->
          <h1 v-if="isMobileSettings" class="truncate text-base font-semibold text-ctp-text sm:hidden">
            {{ mobileSettingsTitle }}
          </h1>

          <!-- Mobile (everywhere else): looks exactly like the desktop search
               box, but taps through to the full /search screen instead of
               typing inline. -->
          <SearchInputShell v-else-if="route.path !== '/search'" class="flex sm:hidden">
            <button
              type="button"
              :class="[SEARCH_FIELD_CLASS, 'flex items-center text-left']"
              aria-label="Search"
              @click="router.push('/search')"
            >
              <span class="text-ctp-subtext0">Search…</span>
            </button>
          </SearchInputShell>
        </template>
      </AppNavbar>

      <div id="main-content" class="flex-1 overflow-y-scroll">
        <RouterView />
      </div>
    </div>
  </div>

  <ToastStack />
  <FeatureTour />
  <OnboardingCoach v-if="coachVisible" />
  <ShortcutHelpOverlay v-model:open="shortcutHelpOpen" />
</template>

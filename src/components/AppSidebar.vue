<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { useRouter, useRoute, RouterLink } from 'vue-router'
import { useLabelsStore } from '@/stores/labels'
import { useViewsStore } from '@/stores/views'
import { useAccountStore } from '@/stores/account'
import { useArcsStore } from '@/stores/arcs'
import { useQuarantineStore } from '@/stores/quarantine'
import { useDraftsStore } from '@/stores/drafts'
import { loginClient } from '@/lib/auth'
import { isAdminUser } from '@/stores/admin'

defineProps<{ open: boolean }>()

const route = useRoute()
const router = useRouter()
const labelsStore = useLabelsStore()
const viewsStore = useViewsStore()
const accountStore = useAccountStore()
const arcsStore = useArcsStore()
const quarantineStore = useQuarantineStore()
const draftsStore = useDraftsStore()

const isAdmin = computed(() => isAdminUser())

// Notification badges — counts are now computed from persisted _byAccount data,
// so no explicit fetch is needed. The quarantine store hydrates from localStorage
// and the counts derive reactively.

function formatBadgeCount(count: number, hasMore: boolean) {
  if (count > 99) return '99+'
  return hasMore ? `${count}+` : `${count}`
}

// ── User identity for mobile profile row ──────────────────────────────────────
interface Identity {
  userId?: string
  sub?: string
  email?: string
  name?: string
  picture?: string
}
const identity = ref<Identity | null>(null)

onMounted(() => {
  identity.value = loginClient.getUserIdentity() as Identity | null
})

const displayName = computed(() => identity.value?.name ?? identity.value?.email ?? null)
const email = computed(() => identity.value?.email ?? null)
const picture = computed(() => identity.value?.picture ?? null)
const initials = computed(() => {
  const n = identity.value?.name
  if (n) {
    const parts = n.trim().split(/\s+/)
    return parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : n.slice(0, 2).toUpperCase()
  }
  const e = identity.value?.email
  if (e) return e.slice(0, 2).toUpperCase()
  return '?'
})

function navigateToProfile() {
  void router.push('/settings?tab=profile')
}

const isActive = (path: string) => route.path === path || route.path.startsWith(path + '/')
const exactActive = (path: string) => route.path === path

// Drag-and-drop reordering for custom views
const dragSource = ref<string | null>(null)

function onDragStart(viewId: string) {
  dragSource.value = viewId
}

function onDrop(targetId: string) {
  if (!dragSource.value || dragSource.value === targetId) return
  viewsStore.reorder(dragSource.value, targetId)
  dragSource.value = null
}

function onDragOver(e: DragEvent) {
  e.preventDefault()
}

function navigateToView(v: { workflow?: string; labels?: string[] }) {
  const query: Record<string, string> = {}
  if (v.workflow) query.workflow = v.workflow
  if (v.labels?.[0]) query.label = v.labels[0]
  void router.push({ path: '/', query })
}

const viewsLoaded = computed(() => !viewsStore.loading)
const sortedViews = computed(() => viewsStore.sortedViews)

// Account switcher (shown at bottom when multiple accounts)
const accountSwitcherOpen = ref(false)
</script>

<template>
  <aside
    class="fixed inset-y-0 left-0 z-40 flex w-56 flex-col border-r border-ctp-surface0 bg-ctp-mantle transition-transform duration-200 sm:static sm:inset-auto sm:z-auto sm:transition-none"
    :class="open ? 'translate-x-0' : '-translate-x-full sm:translate-x-0'"
  >
    <!-- Brand -->
    <div class="flex h-11 items-center border-b border-ctp-surface0 px-4">
      <span class="text-sm font-semibold text-ctp-text">Numaeel</span>
    </div>

    <nav class="flex-1 overflow-y-auto py-8">
      <!-- Main nav -->
      <div class="px-2">
        <RouterLink
          to="/"
          data-tour="nav-inbox"
          class="flex items-center gap-2.5 rounded-lg px-3 py-3 text-base sm:gap-2 sm:py-2 sm:text-sm transition-colors"
          :class="
            exactActive('/')
              ? 'bg-ctp-surface0 text-ctp-text font-medium'
              : 'text-ctp-subtext1 hover:bg-ctp-surface0/50 hover:text-ctp-text'
          "
        >
          <!-- Inbox icon -->
          <svg class="h-5 w-5 sm:h-4 sm:w-4 shrink-0" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path
              d="M1 2.5A1.5 1.5 0 012.5 1h11A1.5 1.5 0 0115 2.5v11a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 011 13.5v-11zM2.5 2a.5.5 0 00-.5.5V9h2.5a.5.5 0 01.5.5 2.5 2.5 0 005 0 .5.5 0 01.5-.5H13V2.5a.5.5 0 00-.5-.5h-10z"
            />
          </svg>
          <span class="flex-1">Inbox</span>
          <span
            v-if="arcsStore.activeCount > 0"
            class="shrink-0 rounded-full bg-ctp-mauve px-1.5 py-0.5 text-[10px] font-semibold leading-none text-ctp-base"
          >
            {{ formatBadgeCount(arcsStore.activeCount, arcsStore.activeCountHasMore) }}
          </span>
        </RouterLink>

        <RouterLink
          to="/quarantine"
          data-tour="nav-quarantine"
          class="flex items-center gap-2.5 rounded-lg px-3 py-3 text-base sm:gap-2 sm:py-2 sm:text-sm transition-colors"
          :class="
            isActive('/quarantine')
              ? 'bg-ctp-surface0 text-ctp-text font-medium'
              : 'text-ctp-subtext1 hover:bg-ctp-surface0/50 hover:text-ctp-text'
          "
        >
          <!-- Shield icon -->
          <svg class="h-5 w-5 sm:h-4 sm:w-4 shrink-0" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path
              d="M8 1l6 2v4c0 3.5-2.5 6.3-6 7.5C2.5 13.3 0 10.5 0 7V3l8-2zm0 1.5L1.5 4.3V7c0 2.8 2 5.1 6.5 6.3C12.5 12.1 14.5 9.8 14.5 7V4.3L8 2.5z"
            />
          </svg>
          <span class="flex-1">Quarantine</span>
          <span
            v-if="quarantineStore.visibleCount > 0"
            class="shrink-0 rounded-full bg-ctp-peach px-1.5 py-0.5 text-[10px] font-semibold leading-none text-ctp-base"
          >
            {{ formatBadgeCount(quarantineStore.visibleCount, quarantineStore.visibleCountHasMore) }}
          </span>
        </RouterLink>

        <RouterLink
          to="/drafts"
          data-tour="nav-drafts"
          class="flex items-center gap-2.5 rounded-lg px-3 py-3 text-base sm:gap-2 sm:py-2 sm:text-sm transition-colors"
          :class="
            route.path === '/drafts'
              ? 'bg-ctp-surface0 text-ctp-text font-medium'
              : 'text-ctp-subtext1 hover:bg-ctp-surface0/50 hover:text-ctp-text'
          "
        >
          <!-- Pencil icon -->
          <svg class="h-5 w-5 sm:h-4 sm:w-4 shrink-0" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M12.146.146a.5.5 0 01.708 0l3 3a.5.5 0 010 .708l-10 10a.5.5 0 01-.168.11l-5 2a.5.5 0 01-.65-.65l2-5a.5.5 0 01.11-.168l10-10zM11.207 2.5L13.5 4.793 14.793 3.5 12.5 1.207 11.207 2.5zm1.586 3L10.5 3.207 4 9.707V10h.5a.5.5 0 01.5.5v.5h.5a.5.5 0 01.5.5v.5h.293l6.5-6.5z"/>
          </svg>
          <span class="flex-1">Drafts</span>
          <span
            v-if="draftsStore.draftCount > 0"
            class="shrink-0 rounded-full bg-ctp-green px-1.5 py-0.5 text-[10px] font-semibold leading-none text-ctp-base"
          >
            {{ formatBadgeCount(draftsStore.draftCount, false) }}
          </span>
        </RouterLink>

        <!-- Views — always expanded -->
        <div v-if="viewsLoaded && sortedViews.length > 0" class="mt-2 px-2">
          <div class="mb-1 flex items-center justify-between px-3">
            <span class="text-xs font-medium uppercase tracking-wide text-ctp-subtext0">Views</span>
          </div>
          <button
            v-for="view in sortedViews"
            :key="view.viewId"
            type="button"
            draggable="true"
            class="flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-ctp-subtext1 transition-colors hover:bg-ctp-surface0/50 hover:text-ctp-text"
            @click="navigateToView(view)"
            @keydown.enter="navigateToView(view)"
            @dragstart="onDragStart(view.viewId)"
            @dragover="onDragOver"
            @drop="onDrop(view.viewId)"
          >
            <span class="shrink-0 text-xs" aria-hidden="true">{{ view.icon ?? '📋' }}</span>
            <span class="truncate">{{ view.name }}</span>
          </button>
        </div>

        <!-- Separator between inbox items and configuration -->
        <div class="my-3 border-t border-ctp-surface0" />

        <RouterLink
          to="/rules"
          data-tour="nav-rules"
          class="flex items-center gap-2.5 rounded-lg px-3 py-3 text-base sm:gap-2 sm:py-2 sm:text-sm transition-colors"
          :class="
            isActive('/rules')
              ? 'bg-ctp-surface0 text-ctp-text font-medium'
              : 'text-ctp-subtext1 hover:bg-ctp-surface0/50 hover:text-ctp-text'
          "
        >
          <!-- List icon -->
          <svg class="h-5 w-5 sm:h-4 sm:w-4 shrink-0" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path
              fill-rule="evenodd"
              d="M2.5 12a.5.5 0 01.5-.5h10a.5.5 0 010 1H3a.5.5 0 01-.5-.5zm0-4a.5.5 0 01.5-.5h10a.5.5 0 010 1H3a.5.5 0 01-.5-.5zm0-4a.5.5 0 01.5-.5h10a.5.5 0 010 1H3a.5.5 0 01-.5-.5z"
            />
          </svg>
          Rules
        </RouterLink>

        <RouterLink
          to="/templates"
          data-tour="nav-templates"
          class="flex items-center gap-2.5 rounded-lg px-3 py-3 text-base sm:gap-2 sm:py-2 sm:text-sm transition-colors"
          :class="
            isActive('/templates')
              ? 'bg-ctp-surface0 text-ctp-text font-medium'
              : 'text-ctp-subtext1 hover:bg-ctp-surface0/50 hover:text-ctp-text'
          "
        >
          <!-- Document icon -->
          <svg class="h-5 w-5 sm:h-4 sm:w-4 shrink-0" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M4 0a2 2 0 00-2 2v12a2 2 0 002 2h8a2 2 0 002-2V4.5L9.5 0H4zm5 1v3.5H12L9 1zM4 7h8v1H4V7zm0 2h8v1H4V9zm0 2h5v1H4v-1z"/>
          </svg>
          Templates
        </RouterLink>

        <RouterLink
          to="/labels"
          data-tour="nav-labels"
          class="flex items-center gap-2.5 rounded-lg px-3 py-3 text-base sm:gap-2 sm:py-2 sm:text-sm transition-colors"
          :class="
            isActive('/labels')
              ? 'bg-ctp-surface0 text-ctp-text font-medium'
              : 'text-ctp-subtext1 hover:bg-ctp-surface0/50 hover:text-ctp-text'
          "
        >
          <!-- Tag icon -->
          <svg class="h-5 w-5 sm:h-4 sm:w-4 shrink-0" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path
              d="M1 1h6.5a1 1 0 01.707.293l6 6a1 1 0 010 1.414l-5 5a1 1 0 01-1.414 0l-6-6A1 1 0 011 7.5V1zm1.5 1.5v5l5.5 5.5 4-4L7 3.5H2.5zM4 4.5a.5.5 0 100 1 .5.5 0 000-1z"
            />
          </svg>
          Labels
        </RouterLink>
        <div v-if="labelsStore.items.length > 0" class="ml-6 mt-0.5 space-y-0.5">
          <RouterLink
            v-for="label in labelsStore.items"
            :key="label.label"
            :to="{ path: '/search', query: { label: label.name } }"
            class="flex items-center gap-2 rounded px-2 py-1 text-xs text-ctp-subtext0 hover:bg-ctp-surface0/50 hover:text-ctp-text"
          >
            <span class="h-2 w-2 shrink-0 rounded-full" :style="{ backgroundColor: label.color ?? '#cba6f7' }" />
            <span class="truncate">{{ label.icon ? `${label.icon} ` : '' }}{{ label.name }}</span>
          </RouterLink>
        </div>

        <RouterLink
          to="/settings"
          data-tour="nav-settings"
          class="flex items-center gap-2.5 rounded-lg px-3 py-3 text-base sm:gap-2 sm:py-2 sm:text-sm transition-colors"
          :class="
            isActive('/settings')
              ? 'bg-ctp-surface0 text-ctp-text font-medium'
              : 'text-ctp-subtext1 hover:bg-ctp-surface0/50 hover:text-ctp-text'
          "
        >
          <!-- Gear icon -->
          <svg class="h-5 w-5 sm:h-4 sm:w-4 shrink-0" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path
              d="M8 4.754a3.246 3.246 0 100 6.492 3.246 3.246 0 000-6.492zM5.754 8a2.246 2.246 0 114.492 0 2.246 2.246 0 01-4.492 0z"
            />
            <path
              d="M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0l-.094.319a.873.873 0 01-1.255.52l-.292-.16c-1.64-.892-3.433.902-2.54 2.541l.159.292a.873.873 0 01-.52 1.255l-.319.094c-1.79.527-1.79 3.065 0 3.592l.319.094a.873.873 0 01.52 1.255l-.16.292c-.892 1.64.901 3.434 2.541 2.54l.292-.159a.873.873 0 011.255.52l.094.319c.527 1.79 3.065 1.79 3.592 0l.094-.319a.873.873 0 011.255-.52l.292.16c1.64.893 3.434-.902 2.54-2.541l-.159-.292a.873.873 0 01.52-1.255l.319-.094c1.79-.527 1.79-3.065 0-3.592l-.319-.094a.873.873 0 01-.52-1.255l.16-.292c.893-1.64-.902-3.433-2.541-2.54l-.292.159a.873.873 0 01-1.255-.52l-.094-.319zm-2.633.283c.246-.835 1.428-.835 1.674 0l.094.319a1.873 1.873 0 002.693 1.115l.291-.16c.764-.415 1.6.42 1.184 1.185l-.159.292a1.873 1.873 0 001.116 2.692l.318.094c.835.246.835 1.428 0 1.674l-.319.094a1.873 1.873 0 00-1.115 2.693l.16.291c.415.764-.42 1.6-1.185 1.184l-.291-.159a1.873 1.873 0 00-2.693 1.116l-.094.318c-.246.835-1.428.835-1.674 0l-.094-.319a1.873 1.873 0 00-2.692-1.115l-.292.16c-.764.415-1.6-.42-1.184-1.185l.159-.291A1.873 1.873 0 003.06 8.955l-.318-.094c-.835-.246-.835-1.428 0-1.674l.319-.094A1.873 1.873 0 004.175 4.6l-.16-.292c-.415-.764.42-1.6 1.185-1.184l.292.159a1.873 1.873 0 002.692-1.115l.094-.319z"
            />
          </svg>
          Settings
        </RouterLink>

        <RouterLink
          v-if="isAdmin"
          to="/admin"
          class="flex items-center gap-2.5 rounded-lg px-3 py-3 text-base sm:gap-2 sm:py-2 sm:text-sm transition-colors"
          :class="
            isActive('/admin')
              ? 'bg-ctp-surface0 text-ctp-text font-medium'
              : 'text-ctp-subtext1 hover:bg-ctp-surface0/50 hover:text-ctp-text'
          "
        >
          <!-- Terminal icon -->
          <svg class="h-5 w-5 sm:h-4 sm:w-4 shrink-0" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M0 2a2 2 0 012-2h12a2 2 0 012 2v12a2 2 0 01-2 2H2a2 2 0 01-2-2V2zm1.5 0v12a.5.5 0 00.5.5h12a.5.5 0 00.5-.5V2a.5.5 0 00-.5-.5H2a.5.5 0 00-.5.5zM4 10l3-3-3-3 1-1 4 4-4 4-1-1zm4 2h4v1H8v-1z"/>
          </svg>
          Admin
        </RouterLink>
      </div>



    </nav>

    <!-- Mobile user profile (visible only below sm) -->
    <div class="border-t border-ctp-surface0 px-2 py-2 sm:hidden">
      <button
        type="button"
        class="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition-colors hover:bg-ctp-surface0/50"
        @click="navigateToProfile"
      >
        <span class="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full ring-2 ring-ctp-surface1">
          <img
            v-if="picture"
            :src="picture"
            :alt="displayName ?? 'Profile'"
            class="h-full w-full object-cover"
            referrerpolicy="no-referrer"
          />
          <span
            v-else
            class="flex h-full w-full items-center justify-center bg-ctp-surface1 text-xs font-semibold text-ctp-subtext1"
          >
            {{ initials }}
          </span>
        </span>
        <div class="min-w-0 flex-1">
          <p v-if="displayName" class="truncate text-sm font-medium text-ctp-text">{{ displayName }}</p>
          <p v-if="email && email !== displayName" class="truncate text-xs text-ctp-subtext0">{{ email }}</p>
        </div>
      </button>
    </div>

    <!-- Account switcher -->
    <div v-if="accountStore.accounts.length > 1" class="relative border-t border-ctp-surface0 px-2 py-2">
      <button
        type="button"
        class="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm text-ctp-subtext1 transition-colors hover:bg-ctp-surface0/50 hover:text-ctp-text"
        :aria-expanded="accountSwitcherOpen"
        aria-haspopup="listbox"
        @click="accountSwitcherOpen = !accountSwitcherOpen"
      >
        <span class="truncate">{{ accountStore.account?.name ?? 'Account' }}</span>
        <svg
          class="h-3 w-3 shrink-0 transition-transform"
          :class="{ 'rotate-180': accountSwitcherOpen }"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
        >
          <path d="M4 6l4 4 4-4" />
        </svg>
      </button>

      <!-- Dropdown (positioned above) -->
      <div
        v-if="accountSwitcherOpen"
        class="absolute bottom-full left-2 right-2 z-50 mb-1 overflow-hidden rounded-lg border border-ctp-surface1 bg-ctp-mantle shadow-lg"
      >
        <button
          v-for="acc in accountStore.accounts"
          :key="acc.accountId"
          class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-ctp-surface0"
          :class="acc.accountId === accountStore.accountId ? 'font-medium text-ctp-text' : 'text-ctp-subtext1'"
          @click="accountSwitcherOpen = false; accountStore.switchAccount(acc.accountId)"
        >
          <span class="flex-1 truncate">{{ acc.name }}</span>
          <svg
            v-if="acc.accountId === accountStore.accountId"
            class="h-3.5 w-3.5 shrink-0 text-ctp-mauve"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
          >
            <path d="M2 8l4 4 8-8" />
          </svg>
        </button>
      </div>
      <div v-if="accountSwitcherOpen" role="presentation" class="fixed inset-0 z-40" @click="accountSwitcherOpen = false" />
    </div>
  </aside>
</template>

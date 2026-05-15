<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter, useRoute, RouterLink } from 'vue-router'
import { useLabelsStore } from '@/stores/labels'
import { useViewsStore } from '@/stores/views'
import { useAccountStore } from '@/stores/account'
import { useSupportPanel } from '@/composables/useSupportPanel'

defineProps<{ open: boolean }>()

const route = useRoute()
const router = useRouter()
const labelsStore = useLabelsStore()
const viewsStore = useViewsStore()
const accountStore = useAccountStore()

const switcherOpen = ref(false)
const { open: supportOpen } = useSupportPanel()

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

function navigateToView(v: {
  filters: { workflow?: string; labelId?: string; sender?: string; status?: string }
}) {
  const query: Record<string, string> = {}
  if (v.filters.workflow) query.workflow = v.filters.workflow
  if (v.filters.labelId) query.label = v.filters.labelId
  if (v.filters.sender) query.sender = v.filters.sender
  if (v.filters.status) query.status = v.filters.status
  void router.push({ path: '/', query })
}

function selectAccount(id: string) {
  switcherOpen.value = false
  accountStore.switchAccount(id)
}

const viewsLoaded = computed(() => !viewsStore.loading)
const sortedViews = computed(() => viewsStore.sortedViews)
const labels = computed(() => labelsStore.items)
</script>

<template>
  <aside
    class="fixed inset-y-0 left-0 z-40 flex w-56 flex-col border-r border-ctp-surface0 bg-ctp-mantle transition-transform duration-200 sm:static sm:inset-auto sm:z-auto sm:transition-none"
    :class="open ? 'translate-x-0' : '-translate-x-full sm:translate-x-0'"
  >
    <!-- Brand / account switcher -->
    <div class="relative border-b border-ctp-surface0">
      <button
        class="flex h-12 w-full items-center gap-2 px-4 text-left transition-colors hover:bg-ctp-surface0/50"
        :class="{ 'cursor-default hover:bg-transparent': accountStore.accounts.length <= 1 }"
        @click="accountStore.accounts.length > 1 && (switcherOpen = !switcherOpen)"
      >
        <span class="flex-1 truncate text-sm font-semibold text-ctp-text">
          {{ accountStore.account?.name ?? 'SES Adapter' }}
        </span>
        <svg
          v-if="accountStore.accounts.length > 1"
          class="h-3.5 w-3.5 shrink-0 text-ctp-subtext0 transition-transform"
          :class="{ 'rotate-180': switcherOpen }"
          viewBox="0 0 16 16"
          fill="currentColor"
        >
          <path d="M1.5 5.5l6 6 6-6" stroke="currentColor" stroke-width="1.5" fill="none" />
        </svg>
      </button>

      <!-- Dropdown -->
      <div
        v-if="switcherOpen"
        class="absolute left-0 right-0 top-full z-50 rounded-b-lg border-x border-b border-ctp-surface0 bg-ctp-mantle shadow-lg"
      >
        <button
          v-for="acc in accountStore.accounts"
          :key="acc.id"
          class="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm transition-colors hover:bg-ctp-surface0"
          :class="
            acc.id === accountStore.accountId ? 'font-medium text-ctp-text' : 'text-ctp-subtext1'
          "
          @click="selectAccount(acc.id)"
        >
          <span class="flex-1 truncate">{{ acc.name }}</span>
          <svg
            v-if="acc.id === accountStore.accountId"
            class="h-3.5 w-3.5 shrink-0 text-ctp-mauve"
            viewBox="0 0 16 16"
            fill="currentColor"
          >
            <path d="M2 8l4 4 8-8" stroke="currentColor" stroke-width="1.5" fill="none" />
          </svg>
        </button>
      </div>

      <!-- Click-outside backdrop -->
      <div v-if="switcherOpen" class="fixed inset-0 z-40" @click="switcherOpen = false" />
    </div>

    <nav class="flex-1 overflow-y-auto py-2">
      <!-- Main nav -->
      <div class="px-2">
        <RouterLink
          to="/"
          class="flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors"
          :class="
            exactActive('/')
              ? 'bg-ctp-surface0 text-ctp-text font-medium'
              : 'text-ctp-subtext1 hover:bg-ctp-surface0/50 hover:text-ctp-text'
          "
        >
          <!-- Inbox icon -->
          <svg class="h-4 w-4 shrink-0" viewBox="0 0 16 16" fill="currentColor">
            <path
              d="M1 2.5A1.5 1.5 0 012.5 1h11A1.5 1.5 0 0115 2.5v11a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 011 13.5v-11zM2.5 2a.5.5 0 00-.5.5V9h2.5a.5.5 0 01.5.5 2.5 2.5 0 005 0 .5.5 0 01.5-.5H13V2.5a.5.5 0 00-.5-.5h-10z"
            />
          </svg>
          Inbox
        </RouterLink>

        <RouterLink
          to="/quarantine"
          class="flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors"
          :class="
            isActive('/quarantine')
              ? 'bg-ctp-surface0 text-ctp-text font-medium'
              : 'text-ctp-subtext1 hover:bg-ctp-surface0/50 hover:text-ctp-text'
          "
        >
          <!-- Shield icon -->
          <svg class="h-4 w-4 shrink-0" viewBox="0 0 16 16" fill="currentColor">
            <path
              d="M8 1l6 2v4c0 3.5-2.5 6.3-6 7.5C2.5 13.3 0 10.5 0 7V3l8-2zm0 1.5L1.5 4.3V7c0 2.8 2 5.1 6.5 6.3C12.5 12.1 14.5 9.8 14.5 7V4.3L8 2.5z"
            />
          </svg>
          Quarantine
        </RouterLink>

        <RouterLink
          to="/search"
          class="flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors"
          :class="
            isActive('/search')
              ? 'bg-ctp-surface0 text-ctp-text font-medium'
              : 'text-ctp-subtext1 hover:bg-ctp-surface0/50 hover:text-ctp-text'
          "
        >
          <!-- Search icon -->
          <svg class="h-4 w-4 shrink-0" viewBox="0 0 16 16" fill="currentColor">
            <path
              d="M11.742 10.344a6.5 6.5 0 10-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 001.415-1.414l-3.85-3.85a1.007 1.007 0 00-.115-.099zm-5.242 1.156a5.5 5.5 0 110-11 5.5 5.5 0 010 11z"
            />
          </svg>
          Search
        </RouterLink>
      </div>

      <!-- Custom views -->
      <div v-if="viewsLoaded && sortedViews.length > 0" class="mt-4 px-2">
        <div class="mb-1 flex items-center justify-between px-3">
          <span class="text-xs font-medium uppercase tracking-wide text-ctp-subtext0">Views</span>
          <RouterLink
            to="/labels"
            class="text-xs text-ctp-subtext0 hover:text-ctp-text"
            title="Manage views"
          >
            Manage
          </RouterLink>
        </div>
        <div
          v-for="view in sortedViews"
          :key="view.id"
          draggable="true"
          class="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-ctp-subtext1 transition-colors hover:bg-ctp-surface0/50 hover:text-ctp-text"
          @click="navigateToView(view)"
          @dragstart="onDragStart(view.id)"
          @dragover="onDragOver"
          @drop="onDrop(view.id)"
        >
          <span class="shrink-0 text-xs">{{ view.icon ?? '📋' }}</span>
          <span class="truncate">{{ view.name }}</span>
        </div>
      </div>

      <!-- Labels -->
      <div v-if="labels.length > 0" class="mt-4 px-2">
        <div class="mb-1 flex items-center justify-between px-3">
          <span class="text-xs font-medium uppercase tracking-wide text-ctp-subtext0">Labels</span>
          <RouterLink
            to="/labels"
            class="text-xs text-ctp-subtext0 hover:text-ctp-text"
            title="Manage labels"
          >
            Manage
          </RouterLink>
        </div>
        <RouterLink
          v-for="label in labels"
          :key="label.id"
          :to="`/?label=${label.id}`"
          class="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-ctp-subtext1 transition-colors hover:bg-ctp-surface0/50 hover:text-ctp-text"
        >
          <span
            class="h-2 w-2 shrink-0 rounded-full"
            :style="{ backgroundColor: label.color ?? 'currentColor' }"
          />
          <span class="truncate">{{ label.name }}</span>
        </RouterLink>
      </div>
    </nav>

    <!-- Bottom nav -->
    <div class="border-t border-ctp-surface0 px-2 py-2">
      <RouterLink
        to="/rules"
        class="flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors"
        :class="
          isActive('/rules')
            ? 'bg-ctp-surface0 text-ctp-text font-medium'
            : 'text-ctp-subtext1 hover:bg-ctp-surface0/50 hover:text-ctp-text'
        "
      >
        <!-- List icon -->
        <svg class="h-4 w-4 shrink-0" viewBox="0 0 16 16" fill="currentColor">
          <path
            fill-rule="evenodd"
            d="M2.5 12a.5.5 0 01.5-.5h10a.5.5 0 010 1H3a.5.5 0 01-.5-.5zm0-4a.5.5 0 01.5-.5h10a.5.5 0 010 1H3a.5.5 0 01-.5-.5zm0-4a.5.5 0 01.5-.5h10a.5.5 0 010 1H3a.5.5 0 01-.5-.5z"
          />
        </svg>
        Rules
      </RouterLink>

      <RouterLink
        to="/labels"
        class="flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors"
        :class="
          isActive('/labels')
            ? 'bg-ctp-surface0 text-ctp-text font-medium'
            : 'text-ctp-subtext1 hover:bg-ctp-surface0/50 hover:text-ctp-text'
        "
      >
        <!-- Tag icon -->
        <svg class="h-4 w-4 shrink-0" viewBox="0 0 16 16" fill="currentColor">
          <path
            d="M1 1h6.5a1 1 0 01.707.293l6 6a1 1 0 010 1.414l-5 5a1 1 0 01-1.414 0l-6-6A1 1 0 011 7.5V1zm1.5 1.5v5l5.5 5.5 4-4L7 3.5H2.5zM4 4.5a.5.5 0 100 1 .5.5 0 000-1z"
          />
        </svg>
        Labels
      </RouterLink>

      <RouterLink
        to="/settings"
        class="flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors"
        :class="
          isActive('/settings')
            ? 'bg-ctp-surface0 text-ctp-text font-medium'
            : 'text-ctp-subtext1 hover:bg-ctp-surface0/50 hover:text-ctp-text'
        "
      >
        <!-- Gear icon -->
        <svg class="h-4 w-4 shrink-0" viewBox="0 0 16 16" fill="currentColor">
          <path
            d="M8 4.754a3.246 3.246 0 100 6.492 3.246 3.246 0 000-6.492zM5.754 8a2.246 2.246 0 114.492 0 2.246 2.246 0 01-4.492 0z"
          />
          <path
            d="M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0l-.094.319a.873.873 0 01-1.255.52l-.292-.16c-1.64-.892-3.433.902-2.54 2.541l.159.292a.873.873 0 01-.52 1.255l-.319.094c-1.79.527-1.79 3.065 0 3.592l.319.094a.873.873 0 01.52 1.255l-.16.292c-.892 1.64.901 3.434 2.541 2.54l.292-.159a.873.873 0 011.255.52l.094.319c.527 1.79 3.065 1.79 3.592 0l.094-.319a.873.873 0 011.255-.52l.292.16c1.64.893 3.434-.902 2.54-2.541l-.159-.292a.873.873 0 01.52-1.255l.319-.094c1.79-.527 1.79-3.065 0-3.592l-.319-.094a.873.873 0 01-.52-1.255l.16-.292c.893-1.64-.902-3.433-2.541-2.54l-.292.159a.873.873 0 01-1.255-.52l-.094-.319zm-2.633.283c.246-.835 1.428-.835 1.674 0l.094.319a1.873 1.873 0 002.693 1.115l.291-.16c.764-.415 1.6.42 1.184 1.185l-.159.292a1.873 1.873 0 001.116 2.692l.318.094c.835.246.835 1.428 0 1.674l-.319.094a1.873 1.873 0 00-1.115 2.693l.16.291c.415.764-.42 1.6-1.185 1.184l-.291-.159a1.873 1.873 0 00-2.693 1.116l-.094.318c-.246.835-1.428.835-1.674 0l-.094-.319a1.873 1.873 0 00-2.692-1.115l-.292.16c-.764.415-1.6-.42-1.184-1.185l.159-.291A1.873 1.873 0 003.06 8.955l-.318-.094c-.835-.246-.835-1.428 0-1.674l.319-.094A1.873 1.873 0 004.175 4.6l-.16-.292c-.415-.764.42-1.6 1.185-1.184l.292.159a1.873 1.873 0 002.692-1.115l.094-.319z"
          />
        </svg>
        Settings
      </RouterLink>

      <!-- Help / Support — hidden on mobile (shown in header bar instead) -->
      <button
        class="hidden w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors sm:flex"
        :class="
          supportOpen
            ? 'bg-ctp-surface0 text-ctp-text font-medium'
            : 'text-ctp-subtext1 hover:bg-ctp-surface0/50 hover:text-ctp-text'
        "
        @click="supportOpen = true"
      >
        <svg class="h-4 w-4 shrink-0" viewBox="0 0 16 16" fill="currentColor">
          <path
            d="M5.255 5.786a.237.237 0 00.241.247h.825c.138 0 .248-.113.266-.25.09-.656.54-1.134 1.342-1.134.686 0 1.314.343 1.314 1.168 0 .635-.374.927-.965 1.371-.673.489-1.206 1.06-1.168 1.987l.003.217a.25.25 0 00.25.246h.811a.25.25 0 00.25-.25v-.105c0-.718.273-.927 1.01-1.486.609-.463 1.244-.977 1.244-2.056 0-1.511-1.276-2.241-2.673-2.241-1.267 0-2.655.59-2.75 2.286zm1.557 5.763c0 .533.425.927 1.01.927.609 0 1.028-.394 1.028-.927 0-.552-.42-.94-1.029-.94-.584 0-1.009.388-1.009.94z"
          />
        </svg>
        Help &amp; Support
      </button>

      <!-- Account / Profile -->
      <div class="mt-2 border-t border-ctp-surface0 pt-2">
        <RouterLink
          to="/profile"
          class="flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors"
          :class="
            isActive('/profile')
              ? 'bg-ctp-surface0 text-ctp-text font-medium'
              : 'text-ctp-subtext1 hover:bg-ctp-surface0/50 hover:text-ctp-text'
          "
        >
          <!-- User icon -->
          <svg class="h-4 w-4 shrink-0" viewBox="0 0 16 16" fill="currentColor">
            <path
              d="M8 8a3 3 0 100-6 3 3 0 000 6zm2-3a2 2 0 11-4 0 2 2 0 014 0zm4 8c0 1-1 1-1 1H3s-1 0-1-1 1-4 6-4 6 3 6 4zm-1-.004c-.001-.246-.154-.986-.832-1.664C11.516 10.68 10.029 10 8 10c-2.029 0-3.516.68-4.168 1.332-.678.678-.83 1.418-.832 1.664h10z"
            />
          </svg>
          <span class="flex-1 truncate">{{ accountStore.account?.name ?? 'Profile' }}</span>
        </RouterLink>
      </div>
    </div>
  </aside>
</template>

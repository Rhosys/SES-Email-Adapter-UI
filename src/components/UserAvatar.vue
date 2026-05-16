<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { RouterLink } from 'vue-router'
import { loginClient } from '@/lib/auth'
import CopyInput from '@/components/CopyInput.vue'

defineProps<{ sidebar?: boolean }>()

interface Identity {
  userId?: string
  sub?: string
  email?: string
  name?: string
  picture?: string
}

const identity = ref<Identity | null>(null)
const open = ref(false)
let closeTimer: ReturnType<typeof setTimeout> | null = null

onMounted(() => {
  identity.value = loginClient.getUserIdentity() as Identity | null
})

onUnmounted(() => {
  if (closeTimer) clearTimeout(closeTimer)
})

const picture = computed(() => identity.value?.picture ?? null)
const displayName = computed(() => identity.value?.name ?? identity.value?.email ?? null)
const userId = computed(() => identity.value?.userId ?? identity.value?.sub ?? null)
const email = computed(() => identity.value?.email ?? null)

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

function show() {
  if (closeTimer) { clearTimeout(closeTimer); closeTimer = null }
  open.value = true
}

function scheduleHide() {
  closeTimer = setTimeout(() => { open.value = false }, 120)
}

function handleFocusout(e: FocusEvent) {
  const container = e.currentTarget as HTMLElement
  if (!container.contains(e.relatedTarget as Node | null)) {
    open.value = false
  }
}
</script>

<template>
  <!-- ── Shared wrapper: handles hover stickiness and focusout ─────────────── -->
  <div
    class="relative"
    @mouseenter="show"
    @mouseleave="scheduleHide"
    @focusin="show"
    @focusout="handleFocusout"
  >
    <!-- ── Sidebar mode: full-width row ──────────────────────────────────── -->
    <RouterLink
      v-if="sidebar"
      to="/profile"
      class="flex w-full items-center gap-2.5 rounded-lg py-1.5 text-sm text-ctp-subtext1 transition-colors hover:bg-ctp-surface0/50 hover:text-ctp-text"
    >
      <span class="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full">
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
      <span class="flex-1 truncate">{{ displayName ?? 'Profile' }}</span>
    </RouterLink>

    <!-- ── Compact mode: avatar circle ───────────────────────────────────── -->
    <RouterLink
      v-else
      to="/profile"
      class="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full ring-2 ring-transparent transition-all hover:ring-ctp-mauve/50"
    >
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
    </RouterLink>

    <!-- ── Popup (shared, positioned above in sidebar / below in compact) ── -->
    <div
      v-if="open"
      class="absolute z-50 w-72 overflow-hidden rounded-xl border border-ctp-surface1 bg-ctp-mantle shadow-xl"
      :class="sidebar ? 'bottom-full left-0 mb-2' : 'right-0 top-full mt-2'"
      role="dialog"
      aria-label="Profile details"
      @mouseenter="show"
      @mouseleave="scheduleHide"
    >
      <!-- Header: avatar + name -->
      <div class="flex items-center gap-3 bg-ctp-base px-4 py-3">
        <span class="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full ring-2 ring-ctp-surface1">
          <img
            v-if="picture"
            :src="picture"
            :alt="displayName ?? 'Profile'"
            class="h-full w-full object-cover"
            referrerpolicy="no-referrer"
          />
          <span
            v-else
            class="flex h-full w-full items-center justify-center bg-ctp-surface1 text-sm font-semibold text-ctp-subtext1"
          >
            {{ initials }}
          </span>
        </span>
        <div class="min-w-0 flex-1">
          <p v-if="displayName" class="truncate text-sm font-semibold text-ctp-text">
            {{ displayName }}
          </p>
          <p v-if="email && email !== displayName" class="truncate text-xs text-ctp-subtext0">
            {{ email }}
          </p>
        </div>
      </div>

      <!-- Body: copyable fields -->
      <div class="space-y-3 px-4 py-3">
        <div v-if="email">
          <p class="mb-1 text-xs font-medium text-ctp-subtext0">Email</p>
          <CopyInput :value="email" />
        </div>
        <div v-if="userId">
          <p class="mb-1 text-xs font-medium text-ctp-subtext0">User ID</p>
          <CopyInput :value="userId" mono />
        </div>
      </div>

      <!-- Footer: navigate link -->
      <div class="border-t border-ctp-surface0 px-4 py-2.5">
        <RouterLink
          to="/profile"
          class="flex items-center justify-between text-xs text-ctp-subtext0 transition-colors hover:text-ctp-mauve"
          @click="open = false"
        >
          <span>View full profile</span>
          <span>→</span>
        </RouterLink>
      </div>
    </div>
  </div>
</template>

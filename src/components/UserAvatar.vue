<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { loginClient } from '@/lib/auth'

defineProps<{ sidebar?: boolean }>()

const router = useRouter()

interface Identity {
  userId?: string
  sub?: string
  email?: string
  name?: string
  picture?: string
}

const identity = ref<Identity | null>(null)
const open = ref(false)
const emailCopied = ref(false)
const userIdCopied = ref(false)
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

function navigateToProfile() {
  open.value = false
  void router.push('/profile')
}

function copyEmail() {
  if (!email.value) return
  void navigator.clipboard.writeText(email.value).then(() => {
    emailCopied.value = true
    setTimeout(() => { emailCopied.value = false }, 1500)
  })
}

function copyUserId() {
  if (!userId.value) return
  void navigator.clipboard.writeText(userId.value).then(() => {
    userIdCopied.value = true
    setTimeout(() => { userIdCopied.value = false }, 1500)
  })
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
    @keydown.escape="open = false"
  >
    <!-- ── Sidebar mode: full-width row ──────────────────────────────────── -->
    <button
      v-if="sidebar"
      type="button"
      class="flex w-full items-center gap-2.5 rounded-lg py-1.5 text-sm text-ctp-subtext1 transition-colors hover:bg-ctp-surface0/50 hover:text-ctp-text"
      @click="navigateToProfile"
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
      <span class="flex-1 truncate text-left">{{ displayName ?? 'Profile' }}</span>
    </button>

    <!-- ── Compact mode: avatar circle ───────────────────────────────────── -->
    <button
      v-else
      type="button"
      class="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full ring-2 ring-transparent transition-all hover:ring-ctp-mauve/50"
      @click="navigateToProfile"
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
    </button>

    <!-- ── Popup — v-show keeps the img in the DOM so it only loads once ─── -->
    <div
      v-show="open"
      class="absolute z-50 w-72 overflow-hidden rounded-xl border border-ctp-surface1 bg-ctp-mantle shadow-xl"
      :class="sidebar ? 'bottom-full left-0 mb-2' : 'right-0 top-full mt-2'"
      role="dialog"
      aria-label="Profile details"
      @mouseenter="show"
      @mouseleave="scheduleHide"
    >
      <!-- Header: avatar + name + email -->
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

      <!-- Body: copyable fields — plain text + clipboard icon, no input box -->
      <div class="space-y-2 px-4 py-3">
        <div v-if="email" class="flex items-center justify-between gap-2">
          <div class="min-w-0 flex-1">
            <p class="text-xs font-medium text-ctp-subtext0">Email</p>
            <p class="truncate text-sm text-ctp-text">{{ email }}</p>
          </div>
          <button
            type="button"
            class="shrink-0 transition-colors"
            :class="emailCopied ? 'text-ctp-green' : 'text-ctp-subtext0 hover:text-ctp-text'"
            :aria-label="emailCopied ? 'Copied!' : 'Copy email'"
            @click.stop="copyEmail"
          >
            <!-- Checkmark when copied -->
            <svg v-if="emailCopied" class="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M2.5 8.5l4 4 7-7"/>
            </svg>
            <!-- Clipboard (two stacked pages) when not copied -->
            <svg v-else class="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M5 2h7a1 1 0 011 1v9" stroke-linecap="round"/>
              <rect x="2" y="4" width="9" height="10" rx="1"/>
            </svg>
          </button>
        </div>

        <div v-if="userId" class="flex items-center justify-between gap-2">
          <div class="min-w-0 flex-1">
            <p class="text-xs font-medium text-ctp-subtext0">User ID</p>
            <p class="truncate font-mono text-sm text-ctp-text">{{ userId }}</p>
          </div>
          <button
            type="button"
            class="shrink-0 transition-colors"
            :class="userIdCopied ? 'text-ctp-green' : 'text-ctp-subtext0 hover:text-ctp-text'"
            :aria-label="userIdCopied ? 'Copied!' : 'Copy user ID'"
            @click.stop="copyUserId"
          >
            <svg v-if="userIdCopied" class="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M2.5 8.5l4 4 7-7"/>
            </svg>
            <svg v-else class="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M5 2h7a1 1 0 011 1v9" stroke-linecap="round"/>
              <rect x="2" y="4" width="9" height="10" rx="1"/>
            </svg>
          </button>
        </div>
      </div>

      <!-- Footer: navigate to full profile -->
      <div class="border-t border-ctp-surface0 px-4 py-2.5">
        <button
          type="button"
          class="flex w-full items-center justify-between text-xs text-ctp-subtext0 transition-colors hover:text-ctp-mauve"
          @click="navigateToProfile"
        >
          <span>View full profile</span>
          <span>→</span>
        </button>
      </div>
    </div>
  </div>
</template>

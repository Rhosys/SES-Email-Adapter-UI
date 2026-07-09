<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { logout } from '@/lib/auth'
import { useIdentity } from '@/composables/useIdentity'
import UserAvatarIcon from '@/components/UserAvatarIcon.vue'

defineProps<{ sidebar?: boolean }>()

const router = useRouter()
const identity = useIdentity()
const open = ref(false)
const emailCopied = ref(false)
const userIdCopied = ref(false)
let closeTimer: ReturnType<typeof setTimeout> | null = null

onMounted(() => {
  identity.load()
})

onUnmounted(() => {
  if (closeTimer) clearTimeout(closeTimer)
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

async function signOut() {
  open.value = false
  // Land on the public site root (the marketing/landing page), not the app's
  // deploy base path — a signed-out user has nothing to see inside the app.
  await logout(`${window.location.origin}/`)
}

function copyEmail() {
  if (!identity.email) return
  void navigator.clipboard.writeText(identity.email).then(() => {
    emailCopied.value = true
    setTimeout(() => { emailCopied.value = false }, 1500)
  })
}

function copyUserId() {
  if (!identity.userId) return
  void navigator.clipboard.writeText(identity.userId).then(() => {
    userIdCopied.value = true
    setTimeout(() => { userIdCopied.value = false }, 1500)
  })
}
</script>

<template>
  <!-- ── Shared wrapper: handles hover stickiness and focusout ─────────────── -->
  <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions -->
  <div
    class="relative"
    role="group"
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
        <UserAvatarIcon :picture="identity.picture" :initials="identity.initials" :display-name="identity.displayName" />
      </span>
      <span class="flex-1 truncate text-left">{{ identity.displayName ?? 'Profile' }}</span>
    </button>

    <!-- ── Compact mode: avatar circle ───────────────────────────────────── -->
    <button
      v-else
      type="button"
      class="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full ring-2 ring-transparent transition-all hover:ring-ctp-mauve/50"
      @click="navigateToProfile"
    >
      <UserAvatarIcon :picture="identity.picture" :initials="identity.initials" :display-name="identity.displayName" />
    </button>

    <!-- ── Popup — v-show keeps the img in the DOM so it only loads once ─── -->
    <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions -->
    <div
      v-show="open"
      class="absolute z-50 w-72 overflow-hidden rounded-xl border border-ctp-surface1 bg-ctp-mantle shadow-xl"
      :class="sidebar ? 'bottom-full left-0 mb-2' : 'right-0 top-full mt-2'"
      role="dialog"
      aria-label="Profile details"
      @mouseenter="show"
      @mouseleave="scheduleHide"
      @focusin="show"
      @focusout="scheduleHide"
    >
      <!-- Header: avatar + name + email -->
      <div class="flex items-center gap-3 bg-ctp-base px-4 py-3">
        <span class="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full ring-2 ring-ctp-surface1">
          <UserAvatarIcon :picture="identity.picture" :initials="identity.initials" :display-name="identity.displayName" text-size="text-sm" />
        </span>
        <div class="min-w-0 flex-1">
          <p v-if="identity.displayName" class="truncate text-sm font-semibold text-ctp-text">
            {{ identity.displayName }}
          </p>
          <p v-if="identity.email && identity.email !== identity.displayName" class="truncate text-xs text-ctp-subtext0">
            {{ identity.email }}
          </p>
        </div>
      </div>

      <!-- Body: copyable fields — plain text + clipboard icon, no input box -->
      <div class="space-y-2 px-4 py-3">
        <div v-if="identity.email" class="flex items-center justify-between gap-2">
          <div class="min-w-0 flex-1">
            <p class="text-xs font-medium text-ctp-subtext0">Email</p>
            <p class="truncate text-sm text-ctp-text">{{ identity.email }}</p>
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

        <div v-if="identity.userId" class="flex items-center justify-between gap-2">
          <div class="min-w-0 flex-1">
            <p class="text-xs font-medium text-ctp-subtext0">User ID</p>
            <p class="truncate font-mono text-sm text-ctp-text">{{ identity.userId }}</p>
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

      <!-- Footer: profile link + sign out -->
      <div class="border-t border-ctp-surface0 px-4 py-2.5 flex items-center justify-between gap-2">
        <button
          type="button"
          class="flex items-center gap-1 text-xs text-ctp-subtext0 transition-colors hover:text-ctp-mauve"
          @click="navigateToProfile"
        >
          <span>View full profile</span>
          <span>→</span>
        </button>
        <button
          type="button"
          class="text-xs text-ctp-subtext0 transition-colors hover:text-ctp-red"
          @click="signOut"
        >
          Sign out
        </button>
      </div>
    </div>
  </div>
</template>

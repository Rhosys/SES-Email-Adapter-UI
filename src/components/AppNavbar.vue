<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAccountStore } from '@/stores/account'
import { useSupportPanel } from '@/composables/useSupportPanel'
import { loginClient } from '@/lib/auth'

const emit = defineEmits<{ toggleSidebar: [] }>()
defineProps<{ showHamburger?: boolean }>()

const router = useRouter()
const accountStore = useAccountStore()
const { open: supportOpen } = useSupportPanel()

// ── Account switcher ──────────────────────────────────────────────────────────
const switcherOpen = ref(false)

function selectAccount(id: string) {
  switcherOpen.value = false
  accountStore.switchAccount(id)
}

// ── User menu ─────────────────────────────────────────────────────────────────
interface Identity {
  userId?: string
  sub?: string
  email?: string
  name?: string
  picture?: string
}

const identity = ref<Identity | null>(null)
const userMenuOpen = ref(false)

onMounted(() => {
  identity.value = loginClient.getUserIdentity() as Identity | null
})

const picture = computed(() => identity.value?.picture ?? null)
const displayName = computed(() => identity.value?.name ?? identity.value?.email ?? null)
const userId = computed(() => identity.value?.userId ?? identity.value?.sub ?? null)
const email = computed(() => identity.value?.email ?? null)

const emailCopied = ref(false)
const userIdCopied = ref(false)
const accountIdCopied = ref(false)

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

function copyAccountId() {
  if (!accountStore.accountId) return
  void navigator.clipboard.writeText(accountStore.accountId).then(() => {
    accountIdCopied.value = true
    setTimeout(() => { accountIdCopied.value = false }, 1500)
  })
}

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

function toggleUserMenu() {
  userMenuOpen.value = !userMenuOpen.value
}

function navigateToSettings() {
  userMenuOpen.value = false
  void router.push('/settings')
}

function navigateToProfile() {
  userMenuOpen.value = false
  void router.push('/profile')
}

function openHelp() {
  userMenuOpen.value = false
  supportOpen.value = true
}

async function signOut() {
  userMenuOpen.value = false
  await loginClient.logout()
}

// Close user menu on outside click
function onUserMenuFocusout(e: FocusEvent) {
  const container = e.currentTarget as HTMLElement
  if (!container.contains(e.relatedTarget as Node | null)) {
    userMenuOpen.value = false
  }
}

// Close switcher on outside click
let switcherCloseTimer: ReturnType<typeof setTimeout> | null = null
onUnmounted(() => { if (switcherCloseTimer) clearTimeout(switcherCloseTimer) })
</script>

<template>
  <header
    class="flex h-11 shrink-0 items-center gap-3 border-b border-ctp-surface0 bg-ctp-mantle px-4"
  >
    <!-- Hamburger (mobile only) -->
    <button
      v-if="showHamburger"
      type="button"
      class="flex h-8 w-8 shrink-0 items-center justify-center rounded text-ctp-subtext1 hover:bg-ctp-surface0 hover:text-ctp-text sm:hidden"
      aria-label="Toggle menu"
      @click="emit('toggleSidebar')"
    >
      <svg class="h-4 w-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
        <path
          fill-rule="evenodd"
          d="M2.5 12a.5.5 0 01.5-.5h10a.5.5 0 010 1H3a.5.5 0 01-.5-.5zm0-4a.5.5 0 01.5-.5h10a.5.5 0 010 1H3a.5.5 0 01-.5-.5zm0-4a.5.5 0 01.5-.5h10a.5.5 0 010 1H3a.5.5 0 01-.5-.5z"
        />
      </svg>
    </button>

    <!-- Search (uses slot so AppLayout can inject the full search with lookahead) -->
    <div class="flex-1">
      <slot name="search" />
    </div>

    <!-- Right section: account switcher + user avatar -->
    <div class="flex items-center gap-2">
      <!-- Account switcher -->
      <div v-if="accountStore.accounts.length > 1" class="relative">
        <button
          type="button"
          class="flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-ctp-subtext1 transition-colors hover:bg-ctp-surface0/50 hover:text-ctp-text"
          :aria-expanded="switcherOpen"
          aria-haspopup="listbox"
          @click="switcherOpen = !switcherOpen"
        >
          <span class="max-w-[120px] truncate">{{ accountStore.account?.name ?? 'Account' }}</span>
          <svg
            class="h-3 w-3 shrink-0 transition-transform"
            :class="{ 'rotate-180': switcherOpen }"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
          >
            <path d="M4 6l4 4 4-4" />
          </svg>
        </button>

        <!-- Dropdown -->
        <div
          v-if="switcherOpen"
          class="absolute right-0 top-full z-50 mt-1 min-w-[180px] overflow-hidden rounded-lg border border-ctp-surface1 bg-ctp-mantle shadow-lg"
        >
          <button
            v-for="acc in accountStore.accounts"
            :key="acc.accountId"
            class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-ctp-surface0"
            :class="acc.accountId === accountStore.accountId ? 'font-medium text-ctp-text' : 'text-ctp-subtext1'"
            @click="selectAccount(acc.accountId)"
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
        <div v-if="switcherOpen" role="presentation" class="fixed inset-0 z-40" @click="switcherOpen = false" />
      </div>

      <!-- User avatar + dropdown menu -->
      <div class="relative" @focusout="onUserMenuFocusout">
        <button
          type="button"
          class="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full ring-2 ring-transparent transition-all hover:ring-ctp-mauve/50"
          aria-label="User menu"
          :aria-expanded="userMenuOpen"
          aria-haspopup="menu"
          @click="toggleUserMenu"
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

        <!-- Dropdown menu -->
        <div
          v-if="userMenuOpen"
          class="absolute right-0 top-full z-50 mt-2 w-72 overflow-hidden rounded-xl border border-ctp-surface1 bg-ctp-mantle shadow-xl"
          role="menu"
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

          <!-- Body: copyable fields -->
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
                <svg v-if="emailCopied" class="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M2.5 8.5l4 4 7-7"/>
                </svg>
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

            <div v-if="accountStore.accountId" class="flex items-center justify-between gap-2">
              <div class="min-w-0 flex-1">
                <p class="text-xs font-medium text-ctp-subtext0">Account ID</p>
                <p class="truncate font-mono text-sm text-ctp-text">{{ accountStore.accountId }}</p>
              </div>
              <button
                type="button"
                class="shrink-0 transition-colors"
                :class="accountIdCopied ? 'text-ctp-green' : 'text-ctp-subtext0 hover:text-ctp-text'"
                :aria-label="accountIdCopied ? 'Copied!' : 'Copy account ID'"
                @click.stop="copyAccountId"
              >
                <svg v-if="accountIdCopied" class="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M2.5 8.5l4 4 7-7"/>
                </svg>
                <svg v-else class="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path d="M5 2h7a1 1 0 011 1v9" stroke-linecap="round"/>
                  <rect x="2" y="4" width="9" height="10" rx="1"/>
                </svg>
              </button>
            </div>
          </div>

          <!-- Actions -->
          <div class="border-t border-ctp-surface0 px-4 py-2.5 space-y-0.5">
            <button
              type="button"
              role="menuitem"
              class="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-ctp-subtext1 transition-colors hover:bg-ctp-surface0 hover:text-ctp-text"
              @click="navigateToSettings"
            >
              <!-- Gear icon -->
              <svg class="h-4 w-4 shrink-0" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <path d="M8 4.754a3.246 3.246 0 100 6.492 3.246 3.246 0 000-6.492zM5.754 8a2.246 2.246 0 114.492 0 2.246 2.246 0 01-4.492 0z" />
                <path d="M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0l-.094.319a.873.873 0 01-1.255.52l-.292-.16c-1.64-.892-3.433.902-2.54 2.541l.159.292a.873.873 0 01-.52 1.255l-.319.094c-1.79.527-1.79 3.065 0 3.592l.319.094a.873.873 0 01.52 1.255l-.16.292c-.892 1.64.901 3.434 2.541 2.54l.292-.159a.873.873 0 011.255.52l.094.319c.527 1.79 3.065 1.79 3.592 0l.094-.319a.873.873 0 011.255-.52l.292.16c1.64.893 3.434-.902 2.54-2.541l-.159-.292a.873.873 0 01.52-1.255l.319-.094c1.79-.527 1.79-3.065 0-3.592l-.319-.094a.873.873 0 01-.52-1.255l.16-.292c.893-1.64-.902-3.433-2.541-2.54l-.292.159a.873.873 0 01-1.255-.52l-.094-.319zm-2.633.283c.246-.835 1.428-.835 1.674 0l.094.319a1.873 1.873 0 002.693 1.115l.291-.16c.764-.415 1.6.42 1.184 1.185l-.159.292a1.873 1.873 0 001.116 2.692l.318.094c.835.246.835 1.428 0 1.674l-.319.094a1.873 1.873 0 00-1.115 2.693l.16.291c.415.764-.42 1.6-1.185 1.184l-.291-.159a1.873 1.873 0 00-2.693 1.116l-.094.318c-.246.835-1.428.835-1.674 0l-.094-.319a1.873 1.873 0 00-2.692-1.115l-.292.16c-.764.415-1.6-.42-1.184-1.185l.159-.291A1.873 1.873 0 003.06 8.955l-.318-.094c-.835-.246-.835-1.428 0-1.674l.319-.094A1.873 1.873 0 004.175 4.6l-.16-.292c-.415-.764.42-1.6 1.185-1.184l.292.159a1.873 1.873 0 002.692-1.115l.094-.319z" />
              </svg>
              Settings
            </button>
            <button
              type="button"
              role="menuitem"
              class="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-ctp-subtext1 transition-colors hover:bg-ctp-surface0 hover:text-ctp-text"
              @click="openHelp"
            >
              <!-- Help icon -->
              <svg class="h-4 w-4 shrink-0" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <path d="M5.255 5.786a.237.237 0 00.241.247h.825c.138 0 .248-.113.266-.25.09-.656.54-1.134 1.342-1.134.686 0 1.314.343 1.314 1.168 0 .635-.374.927-.965 1.371-.673.489-1.206 1.06-1.168 1.987l.003.217a.25.25 0 00.25.246h.811a.25.25 0 00.25-.25v-.105c0-.718.273-.927 1.01-1.486.609-.463 1.244-.977 1.244-2.056 0-1.511-1.276-2.241-2.673-2.241-1.267 0-2.655.59-2.75 2.286zm1.557 5.763c0 .533.425.927 1.01.927.609 0 1.028-.394 1.028-.927 0-.552-.42-.94-1.029-.94-.584 0-1.009.388-1.009.94z" />
              </svg>
              Help &amp; Support
            </button>
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
        <div v-if="userMenuOpen" role="presentation" class="fixed inset-0 z-40" @click="userMenuOpen = false" />
      </div>
    </div>
  </header>
</template>

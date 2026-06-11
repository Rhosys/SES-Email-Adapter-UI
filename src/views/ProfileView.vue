<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useAccountStore } from '@/stores/account'
import { loginClient } from '@/lib/auth'
import { UserConfigurationScreen } from '@authress/login'
import type { DeviceType, Device, LinkedIdentity } from '@authress/login'
import { useFeatureTour } from '@/composables/useFeatureTour'
import ShortcutHelpOverlay from '@/components/ShortcutHelpOverlay.vue'
import AsyncButton from '@/components/ui/AsyncButton.vue'
import AppNavbar from '@/components/AppNavbar.vue'

const accountStore = useAccountStore()
const { startTour } = useFeatureTour()
const shortcutHelpOpen = ref(false)

// ── Tabs ──────────────────────────────────────────────────────────────────────
type Tab = 'configuration' | 'security'
const activeTab = ref<Tab>('configuration')

// ── Security data ─────────────────────────────────────────────────────────────
const profile = ref<{ linkedIdentities: LinkedIdentity[] } | null>(null)
const devices = ref<Device[]>([])
const profileLoading = ref(false)
const devicesLoading = ref(false)
const profileError = ref<string | null>(null)
const deviceError = ref<string | null>(null)

const disconnectPending = ref<string | null>(null)
const removePending = ref<string | null>(null)

const addingPasskey = ref(false)
const newPasskeyName = ref('')
const passkeyPending = ref(false)

const linkedIdentities = computed(() => profile.value?.linkedIdentities ?? [])
const canDisconnect = computed(() => linkedIdentities.value.length > 1)

async function loadDevices() {
  devicesLoading.value = true
  deviceError.value = null
  try {
    devices.value = await loginClient.getDevices()
  } catch {
    deviceError.value = 'Failed to load security devices'
  } finally {
    devicesLoading.value = false
  }
}

onMounted(async () => {
  if (!accountStore.account) await accountStore.fetchAccount()
  profileLoading.value = true
  await Promise.all([
    loginClient
      .getUserProfile()
      .then((p) => {
        profile.value = p
      })
      .catch(() => {
        profileError.value = 'Failed to load identity connections'
      })
      .finally(() => {
        profileLoading.value = false
      }),
    loadDevices(),
  ])
})

function providerLabel(connectionId: string): string {
  const s = connectionId.toLowerCase()
  if (s.includes('google')) return 'Google'
  if (s.includes('github')) return 'GitHub'
  if (s.includes('microsoft') || s.includes('azure')) return 'Microsoft / Azure'
  if (s.includes('apple')) return 'Apple'
  if (s.includes('facebook')) return 'Facebook'
  return connectionId
}

function providerIcon(connectionId: string): string {
  const s = connectionId.toLowerCase()
  if (s.includes('google')) return 'G'
  if (s.includes('github')) return '⌥'
  if (s.includes('microsoft') || s.includes('azure')) return 'M'
  if (s.includes('apple')) return ''
  return '?'
}

async function disconnectIdentity(identity: LinkedIdentity) {
  if (!canDisconnect.value) return
  if (
    !confirm(
      `Disconnect ${providerLabel(identity.connection.connectionId)}? You must keep at least one connection.`,
    )
  )
    return
  disconnectPending.value = identity.connection.userId
  profileError.value = null
  try {
    await loginClient.unlinkIdentity(identity.connection.userId)
    profile.value = await loginClient.getUserProfile()
  } catch {
    profileError.value = 'Failed to disconnect identity'
  } finally {
    disconnectPending.value = null
  }
}

async function linkIdentity() {
  await loginClient.openUserConfigurationScreen({ startPage: UserConfigurationScreen.Profile })
  profileLoading.value = true
  try {
    profile.value = await loginClient.getUserProfile()
  } finally {
    profileLoading.value = false
  }
}

async function openMfaSetup() {
  await loginClient.openUserConfigurationScreen({ startPage: UserConfigurationScreen.MFA })
  await loadDevices()
}

async function removeDevice(device: Device) {
  if (!confirm(`Remove "${device.name}"?`)) return
  removePending.value = device.deviceId
  deviceError.value = null
  try {
    await loginClient.deleteDevice(device.deviceId)
    await loadDevices()
  } catch {
    deviceError.value = 'Failed to remove device'
  } finally {
    removePending.value = null
  }
}

async function registerPasskey() {
  const name = newPasskeyName.value.trim()
  if (!name) return
  passkeyPending.value = true
  deviceError.value = null
  try {
    await loginClient.registerDevice({ name, type: 'WebAuthN' as DeviceType })
    await loadDevices()
    newPasskeyName.value = ''
    addingPasskey.value = false
  } catch {
    deviceError.value = 'Passkey registration failed — check your browser supports WebAuthn'
  } finally {
    passkeyPending.value = false
  }
}
</script>

<template>
  <div class="flex min-h-screen flex-col bg-ctp-base text-ctp-text">
    <AppNavbar />

    <header class="border-b border-ctp-surface0 bg-ctp-mantle px-4 py-3">
      <h1 class="text-lg font-semibold">Profile</h1>
      <p class="mt-0.5 text-xs text-ctp-subtext0">
        Identity and security settings for your user account
      </p>
    </header>

    <!-- Tab bar -->
    <div class="border-b border-ctp-surface0 bg-ctp-mantle px-4">
      <nav class="flex gap-4" aria-label="Profile tabs">
        <button
          type="button"
          class="relative py-2 text-sm font-medium transition-colors"
          :class="activeTab === 'configuration' ? 'text-ctp-mauve' : 'text-ctp-subtext0 hover:text-ctp-text'"
          @click="activeTab = 'configuration'"
        >
          Configuration
          <span
            v-if="activeTab === 'configuration'"
            class="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-ctp-mauve"
          />
        </button>
        <button
          type="button"
          class="relative py-2 text-sm font-medium transition-colors"
          :class="activeTab === 'security' ? 'text-ctp-mauve' : 'text-ctp-subtext0 hover:text-ctp-text'"
          @click="activeTab = 'security'"
        >
          Security
          <span
            v-if="activeTab === 'security'"
            class="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-ctp-mauve"
          />
        </button>
      </nav>
    </div>

    <main class="mx-auto max-w-lg space-y-5 px-4 py-6">
      <!-- ── Configuration tab ─────────────────────────────────────────────── -->
      <template v-if="activeTab === 'configuration'">
        <!-- Feature tour -->
        <section class="rounded-lg border border-ctp-surface1 p-4">
          <div class="flex items-center justify-between gap-4">
            <div>
              <h2 class="text-sm font-medium text-ctp-text">Feature tour</h2>
              <p class="mt-0.5 text-xs text-ctp-subtext0">
                Replay the guided walkthrough of the key areas of the app.
              </p>
            </div>
            <button
              class="shrink-0 rounded-lg border border-ctp-surface1 px-3 py-1.5 text-xs text-ctp-subtext1 transition-colors hover:border-ctp-mauve hover:text-ctp-mauve"
              @click="startTour"
            >
              Start tour
            </button>
          </div>
        </section>

        <!-- Keyboard shortcuts -->
        <section class="rounded-lg border border-ctp-surface1 p-4">
          <div class="flex items-center justify-between gap-4">
            <div>
              <h2 class="text-sm font-medium text-ctp-text">Keyboard shortcuts</h2>
              <p class="mt-0.5 text-xs text-ctp-subtext0">
                Press
                <kbd class="rounded bg-ctp-surface1 px-1 py-0.5 font-mono text-xs">?</kbd>
                anywhere to see all shortcuts and customize them.
              </p>
            </div>
            <button
              class="shrink-0 rounded-lg border border-ctp-surface1 px-3 py-1.5 text-xs text-ctp-subtext1 transition-colors hover:border-ctp-mauve hover:text-ctp-mauve"
              @click="shortcutHelpOpen = true"
            >
              Customize
            </button>
          </div>
          <ShortcutHelpOverlay v-model:open="shortcutHelpOpen" />
        </section>
      </template>

      <!-- ── Security tab ──────────────────────────────────────────────────── -->
      <template v-if="activeTab === 'security'">
        <!-- Identity connections -->
        <section class="rounded-lg border border-ctp-surface1 p-4">
          <div class="mb-3 flex items-start justify-between gap-3">
            <div>
              <h2 class="text-sm font-medium text-ctp-text">Identity connections</h2>
              <p class="mt-0.5 text-xs text-ctp-subtext0">
                Providers you can use to sign in — Google, Apple, Microsoft / Azure, GitHub, and more.
                You can link multiple accounts from the same provider.
              </p>
            </div>
            <button
              class="shrink-0 rounded bg-ctp-mauve px-2.5 py-1 text-xs font-medium text-ctp-base hover:opacity-90"
              @click="linkIdentity"
            >
              + Link account
            </button>
          </div>

          <div
            v-if="profileError"
            class="mb-3 rounded border border-ctp-red bg-ctp-red/10 px-3 py-2 text-xs text-ctp-red"
          >
            {{ profileError }}
          </div>

          <div
            v-if="profileLoading"
            role="status"
            aria-label="Loading identities…"
            class="animate-pulse divide-y divide-ctp-surface0"
          >
            <div v-for="i in 2" :key="i" class="flex items-center gap-3 py-3">
              <div class="h-8 w-8 shrink-0 rounded-full bg-ctp-surface1" />
              <div class="flex-1 space-y-1">
                <div class="h-4 rounded bg-ctp-surface1" :style="{ width: `${90 + i * 50}px` }" />
                <div class="h-3 w-24 rounded bg-ctp-surface1" />
              </div>
            </div>
          </div>

          <div
            v-else-if="linkedIdentities.length === 0"
            class="rounded-lg border border-dashed border-ctp-surface1 py-6 text-center text-sm text-ctp-subtext0"
          >
            No linked identities found
          </div>

          <ul v-else class="divide-y divide-ctp-surface0">
            <li
              v-for="identity in linkedIdentities"
              :key="identity.connection.userId"
              class="flex items-center justify-between gap-3 py-2.5"
            >
              <div class="flex items-center gap-2.5">
                <span
                  class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ctp-surface1 text-xs font-medium text-ctp-subtext1"
                >
                  {{ providerIcon(identity.connection.connectionId) }}
                </span>
                <div>
                  <p class="text-sm font-medium text-ctp-text">
                    {{ providerLabel(identity.connection.connectionId) }}
                  </p>
                  <p class="font-mono text-xs text-ctp-subtext0">
                    {{ identity.connection.userId }}
                  </p>
                </div>
              </div>
              <button
                class="shrink-0 text-xs text-ctp-red hover:text-ctp-red/80 disabled:cursor-not-allowed disabled:opacity-40"
                :disabled="!canDisconnect || disconnectPending === identity.connection.userId"
                :title="!canDisconnect ? 'Cannot disconnect your only login method' : undefined"
                @click="disconnectIdentity(identity)"
              >
                {{
                  disconnectPending === identity.connection.userId ? 'Disconnecting…' : 'Disconnect'
                }}
              </button>
            </li>
          </ul>
        </section>

        <!-- Passkeys -->
        <section class="rounded-lg border border-ctp-surface1 p-4">
          <div class="mb-3 flex items-start justify-between gap-3">
            <div>
              <h2 class="text-sm font-medium text-ctp-text">Passkeys</h2>
              <p class="mt-0.5 text-xs text-ctp-subtext0">
                Sign in without a password using Face ID, Touch ID, or Windows Hello.
              </p>
            </div>
            <button
              class="shrink-0 rounded bg-ctp-surface1 px-2.5 py-1 text-xs text-ctp-text hover:bg-ctp-surface2"
              @click="addingPasskey = !addingPasskey"
            >
              {{ addingPasskey ? 'Cancel' : '+ Add passkey' }}
            </button>
          </div>

          <form
            v-if="addingPasskey"
            class="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-ctp-surface1 bg-ctp-base p-3"
            @submit.prevent="registerPasskey"
          >
            <input
              v-model="newPasskeyName"
              type="text"
              aria-label="Passkey device name"
              placeholder="Device name (e.g. MacBook Touch ID)"
              class="flex-1 rounded border border-ctp-surface1 bg-ctp-mantle px-3 py-1.5 text-sm text-ctp-text placeholder:text-ctp-subtext0 focus:border-ctp-mauve focus:outline-none"
              autofocus
            />
            <AsyncButton
              type="submit"
              :action="registerPasskey"
              :disabled="!newPasskeyName.trim()"
              class="rounded bg-ctp-mauve px-3 py-1.5 text-xs font-medium text-ctp-base hover:opacity-90"
            >
              Register
            </AsyncButton>
          </form>

          <div
            v-if="deviceError"
            class="mb-3 rounded border border-ctp-red bg-ctp-red/10 px-3 py-2 text-xs text-ctp-red"
          >
            {{ deviceError }}
          </div>

          <div
            v-if="devicesLoading"
            role="status"
            aria-label="Loading devices…"
            class="animate-pulse divide-y divide-ctp-surface0"
          >
            <div v-for="i in 2" :key="i" class="flex items-center gap-3 py-3">
              <div class="flex-1 space-y-1">
                <div class="h-4 rounded bg-ctp-surface1" :style="{ width: `${80 + i * 60}px` }" />
                <div class="h-3 w-32 rounded bg-ctp-surface1" />
              </div>
              <div class="h-7 w-16 shrink-0 rounded bg-ctp-surface1" />
            </div>
          </div>

          <div
            v-else-if="devices.length === 0"
            class="rounded-lg border border-dashed border-ctp-surface1 py-6 text-center"
          >
            <p class="text-sm text-ctp-subtext1">No passkeys registered</p>
            <p class="mt-1 text-xs text-ctp-subtext0">
              Add a passkey to sign in faster and more securely.
            </p>
          </div>

          <ul v-else class="divide-y divide-ctp-surface0">
            <li
              v-for="device in devices"
              :key="device.deviceId"
              class="flex items-center justify-between py-2.5"
            >
              <div class="flex items-center gap-2.5">
                <svg
                  class="h-4 w-4 shrink-0 text-ctp-subtext0"
                  viewBox="0 0 16 16"
                  fill="currentColor"
                >
                  <path
                    d="M11 1a2 2 0 00-2 2v4a2 2 0 012 2h3a2 2 0 002-2V3a2 2 0 00-2-2h-3zm0 1h3a1 1 0 011 1v4a1 1 0 01-1 1h-3a1 1 0 01-1-1V3a1 1 0 011-1zM2 13a1 1 0 001 1h8a1 1 0 001-1v-2H2v2zm0-3h10V8H2v2zm0-3h10V6H2v1zm0-2h10V4H2v1zM1 3a1 1 0 011-1h6V1H2a2 2 0 00-2 2v9a2 2 0 002 2h8a2 2 0 002-2v-1h-1v1a1 1 0 01-1 1H2a1 1 0 01-1-1V3z"
                  />
                </svg>
                <span class="text-sm text-ctp-text">{{ device.name }}</span>
              </div>
              <button
                class="text-xs text-ctp-red hover:text-ctp-red/80 disabled:opacity-40"
                :disabled="removePending === device.deviceId"
                @click="removeDevice(device)"
              >
                {{ removePending === device.deviceId ? 'Removing…' : 'Remove' }}
              </button>
            </li>
          </ul>
        </section>

        <!-- MFA -->
        <section class="rounded-lg border border-ctp-surface1 p-4">
          <h2 class="mb-1 text-sm font-medium text-ctp-text">MFA</h2>
          <p class="mb-4 text-xs text-ctp-subtext0">
            Add a second factor to protect your account even if your password is compromised.
          </p>

          <div class="space-y-3">
            <!-- Physical security keys -->
            <div class="rounded-lg border border-ctp-surface0 p-3">
              <div class="flex items-start justify-between gap-3">
                <div>
                  <p class="text-sm font-medium text-ctp-text">Physical security key</p>
                  <p class="mt-0.5 text-xs text-ctp-subtext0">
                    FIDO2 hardware keys such as YubiKey, SoloKey, or any FIDO2-certified device.
                  </p>
                </div>
                <button
                  class="shrink-0 rounded bg-ctp-surface1 px-2.5 py-1 text-xs text-ctp-text hover:bg-ctp-surface2"
                  @click="openMfaSetup"
                >
                  + Set up
                </button>
              </div>
            </div>

            <!-- Authenticator app (virtual TOTP) -->
            <div class="rounded-lg border border-ctp-surface0 p-3">
              <div class="flex items-start justify-between gap-3">
                <div>
                  <p class="text-sm font-medium text-ctp-text">Authenticator app</p>
                  <p class="mt-0.5 text-xs text-ctp-subtext0">
                    Virtual TOTP via Google Authenticator, Authy, 1Password, or any TOTP-compatible
                    app on your phone or computer.
                  </p>
                </div>
                <button
                  class="shrink-0 rounded bg-ctp-surface1 px-2.5 py-1 text-xs text-ctp-text hover:bg-ctp-surface2"
                  @click="openMfaSetup"
                >
                  + Set up
                </button>
              </div>
            </div>

            <!-- Hardware TOTP token (device TOTP) -->
            <div class="rounded-lg border border-ctp-surface0 p-3">
              <div class="flex items-start justify-between gap-3">
                <div>
                  <p class="text-sm font-medium text-ctp-text">Hardware TOTP token</p>
                  <p class="mt-0.5 text-xs text-ctp-subtext0">
                    Dedicated OTP devices such as RSA SecurID, OATH hardware tokens, or any
                    TOTP-compatible key fob.
                  </p>
                </div>
                <button
                  class="shrink-0 rounded bg-ctp-surface1 px-2.5 py-1 text-xs text-ctp-text hover:bg-ctp-surface2"
                  @click="openMfaSetup"
                >
                  + Set up
                </button>
              </div>
            </div>
          </div>
        </section>
      </template>
    </main>
  </div>
</template>

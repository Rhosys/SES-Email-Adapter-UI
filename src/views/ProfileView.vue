<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useAccountStore } from '@/stores/account'
import { loginClient } from '@/lib/auth'
import { DeviceType, UserConfigurationScreen } from '@authress/login'
import type { Device, LinkedIdentity } from '@authress/login'

const accountStore = useAccountStore()

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

onMounted(async () => {
  if (!accountStore.account) await accountStore.fetchAccount()

  profileLoading.value = true
  devicesLoading.value = true

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
    loginClient
      .getDevices()
      .then((d) => {
        devices.value = d
      })
      .catch(() => {
        deviceError.value = 'Failed to load security devices'
      })
      .finally(() => {
        devicesLoading.value = false
      }),
  ])
})

function providerLabel(connectionId: string): string {
  const s = connectionId.toLowerCase()
  if (s.includes('google')) return 'Google'
  if (s.includes('github')) return 'GitHub'
  if (s.includes('microsoft')) return 'Microsoft'
  if (s.includes('apple')) return 'Apple'
  if (s.includes('facebook')) return 'Facebook'
  return connectionId
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

async function openLinkIdentity() {
  await loginClient.openUserConfigurationScreen({ startPage: UserConfigurationScreen.Profile })
}

async function removeDevice(device: Device) {
  if (!confirm(`Remove passkey "${device.name}"?`)) return
  removePending.value = device.deviceId
  deviceError.value = null
  try {
    await loginClient.deleteDevice(device.deviceId)
    devices.value = await loginClient.getDevices()
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
    await loginClient.registerDevice({ name, type: DeviceType.WebAuthN })
    devices.value = await loginClient.getDevices()
    newPasskeyName.value = ''
    addingPasskey.value = false
  } catch {
    deviceError.value = 'Passkey registration failed — check your browser supports WebAuthn'
  } finally {
    passkeyPending.value = false
  }
}

async function signOut() {
  await loginClient.logout()
}
</script>

<template>
  <div>
    <header class="border-b border-ctp-surface0 bg-ctp-mantle px-4 py-3">
      <h1 class="text-lg font-semibold">Profile</h1>
      <p class="mt-0.5 text-xs text-ctp-subtext0">
        Identity and security settings for your user account
      </p>
    </header>

    <main class="mx-auto max-w-lg space-y-5 px-4 py-6">
      <!-- Account info -->
      <section class="rounded-lg border border-ctp-surface1 p-4">
        <h2 class="mb-3 text-sm font-medium text-ctp-subtext1">Account</h2>
        <div class="space-y-2">
          <div>
            <p class="text-xs text-ctp-subtext0">Name</p>
            <p class="text-sm text-ctp-text">{{ accountStore.account?.name ?? '—' }}</p>
          </div>
          <div>
            <p class="text-xs text-ctp-subtext0">Account ID</p>
            <p class="font-mono text-xs text-ctp-subtext1">{{ accountStore.accountId ?? '—' }}</p>
          </div>
        </div>
      </section>

      <!-- Identity connections -->
      <section class="rounded-lg border border-ctp-surface1 p-4">
        <div class="mb-3 flex items-center justify-between">
          <div>
            <h2 class="text-sm font-medium text-ctp-subtext1">Identity connections</h2>
            <p class="mt-0.5 text-xs text-ctp-subtext0">Providers you can use to sign in</p>
          </div>
          <button
            class="rounded bg-ctp-surface1 px-2.5 py-1 text-xs text-ctp-text hover:bg-ctp-surface2"
            @click="openLinkIdentity"
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

        <div v-if="profileLoading" class="py-4 text-center text-sm text-ctp-subtext0">Loading…</div>

        <div
          v-else-if="linkedIdentities.length === 0"
          class="py-4 text-center text-sm text-ctp-subtext0"
        >
          No linked identities found
        </div>

        <ul v-else class="divide-y divide-ctp-surface0">
          <li
            v-for="identity in linkedIdentities"
            :key="identity.connection.userId"
            class="flex items-center justify-between py-2.5"
          >
            <div>
              <p class="text-sm font-medium text-ctp-text">
                {{ providerLabel(identity.connection.connectionId) }}
              </p>
              <p class="font-mono text-xs text-ctp-subtext0">{{ identity.connection.userId }}</p>
            </div>
            <button
              class="text-xs text-ctp-red hover:text-ctp-red/80 disabled:cursor-not-allowed disabled:opacity-40"
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

      <!-- Passkey / security devices -->
      <section class="rounded-lg border border-ctp-surface1 p-4">
        <div class="mb-3 flex items-center justify-between">
          <div>
            <h2 class="text-sm font-medium text-ctp-subtext1">Passkeys &amp; security devices</h2>
            <p class="mt-0.5 text-xs text-ctp-subtext0">
              WebAuthn devices registered to your account
            </p>
          </div>
          <button
            class="rounded bg-ctp-surface1 px-2.5 py-1 text-xs text-ctp-text hover:bg-ctp-surface2"
            @click="addingPasskey = !addingPasskey"
          >
            {{ addingPasskey ? 'Cancel' : '+ Add passkey' }}
          </button>
        </div>

        <!-- Add passkey form -->
        <form
          v-if="addingPasskey"
          class="mb-4 flex items-center gap-2 rounded-lg border border-ctp-surface1 bg-ctp-base p-3"
          @submit.prevent="registerPasskey"
        >
          <input
            v-model="newPasskeyName"
            type="text"
            placeholder="Device name (e.g. MacBook Touch ID)"
            class="flex-1 rounded border border-ctp-surface1 bg-ctp-mantle px-3 py-1.5 text-sm text-ctp-text placeholder:text-ctp-subtext0 focus:border-ctp-mauve focus:outline-none"
            autofocus
          />
          <button
            type="submit"
            :disabled="passkeyPending || !newPasskeyName.trim()"
            class="rounded bg-ctp-mauve px-3 py-1.5 text-xs font-medium text-ctp-base hover:opacity-90 disabled:opacity-50"
          >
            {{ passkeyPending ? 'Registering…' : 'Register' }}
          </button>
        </form>

        <div
          v-if="deviceError"
          class="mb-3 rounded border border-ctp-red bg-ctp-red/10 px-3 py-2 text-xs text-ctp-red"
        >
          {{ deviceError }}
        </div>

        <div v-if="devicesLoading" class="py-4 text-center text-sm text-ctp-subtext0">Loading…</div>

        <div
          v-else-if="devices.length === 0"
          class="rounded-lg border border-dashed border-ctp-surface1 py-6 text-center"
        >
          <p class="text-sm text-ctp-subtext1">No passkeys registered</p>
          <p class="mt-1 text-xs text-ctp-subtext0">
            Add a passkey to sign in without a password using Face ID, Touch ID, or a hardware key.
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
                  d="M11 1a2 2 0 00-2 2v4a2 2 0 012 2h3a2 2 0 012-2V3a2 2 0 00-2-2h-3zm0 1h3a1 1 0 011 1v4a1 1 0 01-1 1h-3a1 1 0 01-1-1V3a1 1 0 011-1zM2 13a1 1 0 001 1h8a1 1 0 001-1v-2H2v2zm0-3h10V8H2v2zm0-3h10V6H2v1zm0-2h10V4H2v1zM1 3a1 1 0 011-1h6V1H2a2 2 0 00-2 2v9a2 2 0 002 2h8a2 2 0 002-2v-1h-1v1a1 1 0 01-1 1H2a1 1 0 01-1-1V3z"
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

      <!-- Sign out -->
      <section class="rounded-lg border border-ctp-surface1 p-4">
        <h2 class="mb-3 text-sm font-medium text-ctp-subtext1">Session</h2>
        <button
          class="rounded-lg border border-ctp-red px-4 py-2 text-sm text-ctp-red hover:bg-ctp-red/10"
          @click="signOut"
        >
          Sign out
        </button>
      </section>
    </main>
  </div>
</template>

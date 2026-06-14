<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAccountStore } from '@/stores/account'
import { api } from '@/lib/api'
import { notify } from '@/lib/notifications'
import { loginClient } from '@/lib/auth'
import { UserConfigurationScreen } from '@authress/login'
import type { DeviceType, Device, LinkedIdentity } from '@authress/login'
import { useFeatureTour } from '@/composables/useFeatureTour'
import ShortcutHelpOverlay from '@/components/ShortcutHelpOverlay.vue'
import AsyncButton from '@/components/ui/AsyncButton.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import FilterModeModal from '@/components/ui/FilterModeModal.vue'
import { useConfirmDialog } from '@/composables/useConfirmDialog'
import type {
  Domain,
  DnsRecord,
  Alias,
  ForwardingAddress,
  UnknownSenderPolicy,
  TeamMember,
  UserRole,
} from '@/types/server'

const route = useRoute()
const router = useRouter()
const accountStore = useAccountStore()
const { dialogOpen, dialogOptions, confirm: confirmAction, onConfirm, onCancel } = useConfirmDialog()

type TabKey = 'profile' | 'emails' | 'domains' | 'forwarding' | 'compose' | 'team'
const activeTab = ref<TabKey>('profile')

// ─── Profile tab ─────────────────────────────────────────────────────────────
interface Identity {
  userId?: string
  sub?: string
  email?: string
  name?: string
  picture?: string
}
const identity = ref<Identity | null>(null)

// ─── Profile sub-tabs (Configuration / Security) ─────────────────────────────
type ProfileSubTab = 'configuration' | 'security'
const profileSubTab = ref<ProfileSubTab>('configuration')

const { startTour } = useFeatureTour()
const shortcutHelpOpen = ref(false)

// Security data
const securityProfile = ref<{ linkedIdentities: LinkedIdentity[] } | null>(null)
const securityDevices = ref<Device[]>([])
const securityProfileLoading = ref(false)
const securityDevicesLoading = ref(false)
const securityProfileError = ref<string | null>(null)
const securityDeviceError = ref<string | null>(null)

const disconnectPending = ref<string | null>(null)
const removePending = ref<string | null>(null)

const addingPasskey = ref(false)
const newPasskeyName = ref('')
const passkeyPending = ref(false)

const linkedIdentities = computed(() => securityProfile.value?.linkedIdentities ?? [])
const canDisconnect = computed(() => linkedIdentities.value.length > 1)

async function loadSecurityDevices() {
  securityDevicesLoading.value = true
  securityDeviceError.value = null
  try {
    securityDevices.value = await loginClient.getDevices()
  } catch {
    securityDeviceError.value = 'Failed to load security devices'
  } finally {
    securityDevicesLoading.value = false
  }
}

async function loadSecurityProfile() {
  securityProfileLoading.value = true
  securityProfileError.value = null
  await Promise.all([
    loginClient
      .getUserProfile()
      .then((p) => {
        securityProfile.value = p
      })
      .catch(() => {
        securityProfileError.value = 'Failed to load identity connections'
      })
      .finally(() => {
        securityProfileLoading.value = false
      }),
    loadSecurityDevices(),
  ])
}

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

async function disconnectIdentity(ident: LinkedIdentity) {
  if (!canDisconnect.value) return
  const confirmed = await confirmAction({
    title: 'Disconnect identity',
    message: `Disconnect ${providerLabel(ident.connection.connectionId)}? You must keep at least one connection.`,
    confirmLabel: 'Disconnect',
    confirmVariant: 'danger',
  })
  if (!confirmed) return
  disconnectPending.value = ident.connection.userId
  securityProfileError.value = null
  try {
    await loginClient.unlinkIdentity(ident.connection.userId)
    securityProfile.value = await loginClient.getUserProfile()
  } catch {
    securityProfileError.value = 'Failed to disconnect identity'
  } finally {
    disconnectPending.value = null
  }
}

async function linkIdentity() {
  await loginClient.openUserConfigurationScreen({ startPage: UserConfigurationScreen.Profile })
  securityProfileLoading.value = true
  try {
    securityProfile.value = await loginClient.getUserProfile()
  } finally {
    securityProfileLoading.value = false
  }
}

async function openMfaSetup() {
  await loginClient.openUserConfigurationScreen({ startPage: UserConfigurationScreen.MFA })
  await loadSecurityDevices()
}

async function removeDevice(device: Device) {
  const confirmed = await confirmAction({
    title: 'Remove device',
    message: `Remove "${device.name}"?`,
    confirmLabel: 'Remove',
    confirmVariant: 'danger',
  })
  if (!confirmed) return
  removePending.value = device.deviceId
  securityDeviceError.value = null
  try {
    await loginClient.deleteDevice(device.deviceId)
    await loadSecurityDevices()
  } catch {
    securityDeviceError.value = 'Failed to remove device'
  } finally {
    removePending.value = null
  }
}

async function registerPasskey() {
  const name = newPasskeyName.value.trim()
  if (!name) return
  passkeyPending.value = true
  securityDeviceError.value = null
  try {
    await loginClient.registerDevice({ name, type: 'WebAuthN' as DeviceType })
    await loadSecurityDevices()
    newPasskeyName.value = ''
    addingPasskey.value = false
  } catch {
    securityDeviceError.value = 'Passkey registration failed — check your browser supports WebAuthn'
  } finally {
    passkeyPending.value = false
  }
}

// ─── Account profile tab ─────────────────────────────────────────────────────
const afterSendAction = ref<'archive' | 'keep_active'>('keep_active')
const afterSendPending = ref(false)
const calendarForwardingAddress = ref('')
const calendarForwardingPending = ref(false)
const calendarForwardingSaved = ref(false)

async function updateAfterSendAction(value: 'archive' | 'keep_active') {
  if (!accountStore.accountId) return
  afterSendAction.value = value
  afterSendPending.value = true
  const result = await api.updateAccount(accountStore.accountId, { afterSendAction: value })
  afterSendPending.value = false
  if (result.isOk()) {
    accountStore.account = result.value
  }
}

async function saveCalendarForwarding() {
  if (!accountStore.accountId) return
  calendarForwardingPending.value = true
  calendarForwardingSaved.value = false
  const result = await api.updateAccount(accountStore.accountId, {
    defaultCalendarInviteForwardingAddress: calendarForwardingAddress.value.trim() || undefined,
  })
  calendarForwardingPending.value = false
  if (result.isOk()) {
    accountStore.account = result.value
    calendarForwardingSaved.value = true
    setTimeout(() => {
      calendarForwardingSaved.value = false
    }, 2000)
  }
}

// ─── Email addresses tab ──────────────────────────────────────────────────────
const aliases = ref<Alias[]>([])
const aliasesLoading = ref(false)
const aliasError = ref('')
const newAddress = ref('')
const newAddressPending = ref(false)

const filterModalOpen = ref(false)
const filterModalAlias = ref<Alias | null>(null)
const defaultPolicyModalOpen = ref(false)
const newAddressHandlingModalOpen = ref(false)

const FILTER_MODES: { value: UnknownSenderPolicy; label: string; description: string }[] = [
  { value: 'allow_all', label: 'Allow all', description: 'All senders pass through' },
  { value: 'quarantine_visible', label: 'Quarantine and notify', description: 'Unknown senders held for review, you get notified' },
  { value: 'quarantine_hidden', label: 'Quarantine', description: 'Unknown senders silently held for review' },
  { value: 'block_hidden', label: 'Block email', description: 'Unknown senders silently discarded' },
  { value: 'block_reject', label: 'Block and deny', description: 'Unknown senders receive a bounce' },
  { value: 'violate_report', label: 'Report Violation', description: 'Report as a policy violation' },
]

const NEW_ADDRESS_HANDLING_MODES = [
  { value: 'auto_allow', label: 'Auto-allow', description: 'Emails to unrecognised addresses are accepted and a new alias is created automatically' },
  { value: 'block_until_approved', label: 'Block until approved', description: 'Emails to unrecognised addresses are held until you manually create or approve the alias' },
]

async function loadAliases() {
  if (!accountStore.accountId) return
  aliasesLoading.value = true
  const result = await api.listAliases(accountStore.accountId)
  aliasesLoading.value = false
  if (result.isOk()) aliases.value = result.value
  else aliasError.value = result.error.message
}

async function addAddress() {
  if (!accountStore.accountId || !newAddress.value.trim()) return
  newAddressPending.value = true
  const result = await api.createAlias(accountStore.accountId, { address: newAddress.value.trim() })
  newAddressPending.value = false
  if (result.isOk()) {
    aliases.value = [...aliases.value, result.value]
    newAddress.value = ''
  } else {
    aliasError.value = result.error.message
  }
}

async function updateAliasMode(address: string, unknownSenderPolicy: UnknownSenderPolicy) {
  if (!accountStore.accountId) return
  const result = await api.updateAlias(accountStore.accountId, address, { unknownSenderPolicy })
  if (result.isOk()) {
    aliases.value = aliases.value.map((a) => (a.address === address ? result.value : a))
  }
}

async function updateAliasThreshold(address: string, raw: string) {
  if (!accountStore.accountId) return
  const value = raw.trim() === '' ? undefined : Math.min(10, Math.max(0, Number(raw)))
  const result = await api.updateAlias(accountStore.accountId, address, { spamScoreThreshold: value })
  if (result.isOk()) {
    aliases.value = aliases.value.map((a) => (a.address === address ? result.value : a))
  }
}

async function updateDefaultPolicy(policy: UnknownSenderPolicy) {
  if (!accountStore.accountId) return
  const result = await api.updateAccount(accountStore.accountId, {
    filtering: { ...accountStore.account?.filtering, defaultUnknownSenderPolicy: policy },
  })
  if (result.isOk()) accountStore.account = result.value
}

async function updateNewAddressHandling(value: 'auto_allow' | 'block_until_approved') {
  if (!accountStore.accountId) return
  const result = await api.updateAccount(accountStore.accountId, {
    filtering: { ...accountStore.account?.filtering, newAddressHandling: value },
  })
  if (result.isOk()) accountStore.account = result.value
}

async function updateAccountSpamThreshold(raw: string) {
  if (!accountStore.accountId) return
  const value = raw === '' ? undefined : Math.min(10, Math.max(1, Number(raw)))
  const result = await api.updateAccount(accountStore.accountId, {
    filtering: { ...accountStore.account?.filtering, spamScoreThreshold: value },
  })
  if (result.isOk()) accountStore.account = result.value
}

async function deleteAddress(address: string) {
  if (!accountStore.accountId) return
  const confirmed = await confirmAction({
    title: 'Remove address',
    message: `Remove ${address}? Emails sent to this address will no longer be received.`,
    confirmLabel: 'Remove',
    confirmVariant: 'danger',
  })
  if (!confirmed) return
  const result = await api.deleteAlias(accountStore.accountId, address)
  if (result.isOk()) aliases.value = aliases.value.filter((a) => a.address !== address)
}

// ─── Domains tab ──────────────────────────────────────────────────────────────
const domains = ref<(Domain & { records?: DnsRecord[] })[]>([])
const domainsLoading = ref(false)
const newDomain = ref('')
const addDomainPending = ref(false)
const recheckPending = ref<Set<string>>(new Set())

async function loadDomains() {
  if (!accountStore.accountId) return
  domainsLoading.value = true
  const result = await api.listDomains(accountStore.accountId)
  domainsLoading.value = false
  if (result.isOk()) domains.value = result.value
}

async function addDomain() {
  if (!accountStore.accountId || !newDomain.value.trim()) return
  addDomainPending.value = true
  const result = await api.addDomain(accountStore.accountId, { domain: newDomain.value.trim() })
  addDomainPending.value = false
  if (result.isOk()) {
    domains.value = [...domains.value, result.value]
    newDomain.value = ''
  }
}

async function recheckDomain(domainId: string) {
  if (!accountStore.accountId || recheckPending.value.has(domainId)) return
  recheckPending.value = new Set([...recheckPending.value, domainId])
  const result = await api.recheckDomain(accountStore.accountId, domainId)
  recheckPending.value = new Set([...recheckPending.value].filter((id) => id !== domainId))
  if (result.isOk()) {
    domains.value = domains.value.map((d) => (d.domainId === domainId ? result.value : d))
  }
}

const STATUS_COLORS: Record<string, string> = {
  verified: 'text-ctp-green',
  pending: 'text-ctp-yellow',
  failing: 'text-ctp-red',
}

// ─── Forwarding addresses tab ─────────────────────────────────────────────────
const forwarding = ref<ForwardingAddress[]>([])
const forwardingLoading = ref(false)
const newForwardAddress = ref('')
const addForwardPending = ref(false)

async function loadForwarding() {
  if (!accountStore.accountId) return
  forwardingLoading.value = true
  const result = await api.listForwardingAddresses(accountStore.accountId)
  forwardingLoading.value = false
  if (result.isOk()) forwarding.value = result.value
}

async function addForwardingAddress() {
  if (!accountStore.accountId || !newForwardAddress.value.trim()) return
  addForwardPending.value = true
  const result = await api.createForwardingAddress(accountStore.accountId, {
    address: newForwardAddress.value.trim(),
  })
  addForwardPending.value = false
  if (result.isOk()) {
    forwarding.value = [...forwarding.value, result.value]
    newForwardAddress.value = ''
  }
}

async function removeForwarding(address: string) {
  if (!accountStore.accountId) return
  const result = await api.deleteForwardingAddress(accountStore.accountId, address)
  if (result.isOk()) forwarding.value = forwarding.value.filter((f) => f.address !== address)
}

// ─── Team tab ─────────────────────────────────────────────────────────────────
const team = ref<TeamMember[]>([])
const teamLoading = ref(false)
const inviteEmail = ref('')
const inviteRole = ref<UserRole>('member')
const invitePending = ref(false)
const teamError = ref('')

const ROLES: UserRole[] = ['admin', 'member', 'viewer']

const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  admin: 'Full access including billing and account deletion',
  member: 'Process emails and manage rules',
  viewer: 'Read-only access',
}

// ─── DNS copy-to-clipboard ───────────────────────────────────────────────────
const copiedDns = ref<Set<string>>(new Set())

function copyDnsValue(key: string, value: string) {
  void navigator.clipboard.writeText(value).then(() => {
    copiedDns.value = new Set([...copiedDns.value, key])
    setTimeout(() => {
      copiedDns.value = new Set([...copiedDns.value].filter((k) => k !== key))
    }, 1500)
  })
}

async function loadTeam() {
  if (!accountStore.accountId) return
  teamLoading.value = true
  const result = await api.listTeamMembers(accountStore.accountId)
  teamLoading.value = false
  if (result.isOk()) team.value = result.value
  else teamError.value = result.error.message
}

async function inviteMember() {
  if (!accountStore.accountId || !inviteEmail.value.trim()) return
  invitePending.value = true
  const result = await api.inviteTeamMember(accountStore.accountId, {
    email: inviteEmail.value.trim(),
    role: inviteRole.value,
  })
  invitePending.value = false
  if (result.isOk()) {
    team.value = [...team.value, result.value]
    inviteEmail.value = ''
  } else {
    teamError.value = result.error.message
  }
}

async function updateMemberRole(userId: string, role: UserRole) {
  if (!accountStore.accountId) return
  const result = await api.updateTeamMember(accountStore.accountId, userId, { role })
  if (result.isOk()) {
    team.value = team.value.map((m) => (m.userId === userId ? result.value : m))
  }
}

async function removeMember(userId: string, displayName: string) {
  if (!accountStore.accountId) return
  const confirmed = await confirmAction({
    title: 'Remove team member',
    message: `Remove ${displayName} from the team? They will lose access immediately.`,
    confirmLabel: 'Remove',
    confirmVariant: 'danger',
  })
  if (!confirmed) return
  const result = await api.removeTeamMember(accountStore.accountId, userId)
  if (result.isOk()) team.value = team.value.filter((m) => m.userId !== userId)
}

// ─── Notifications tab ────────────────────────────────────────────────────────
const emailNotifEnabled = ref(false)
const emailNotifAddress = ref('')
const emailNotifFrequency = ref<'instant' | 'hourly' | 'daily'>('daily')
const notifPending = ref(false)
const notifSaved = ref(false)

async function saveNotifications() {
  if (!accountStore.accountId) return
  notifPending.value = true
  notifSaved.value = false
  const result = await api.updateAccount(accountStore.accountId, {
    notifications: {
      email: {
        enabled: emailNotifEnabled.value,
        address: emailNotifAddress.value.trim(),
        frequency: emailNotifFrequency.value,
      },
    },
  })
  notifPending.value = false
  if (result.isOk()) {
    notifSaved.value = true
    setTimeout(() => {
      notifSaved.value = false
    }, 2000)
  }
}

function sendTestNotification() {
  if (!('Notification' in window)) return
  if (Notification.permission === 'granted') {
    notify({
      title: 'Test notification from SES Adapter',
      body: 'If you see this, browser notifications are working.',
      onClick: () => { void router.push('/') },
    })
    return
  }
  void Notification.requestPermission().then((permission) => {
    if (permission === 'granted') {
      notify({
        title: 'Test notification from SES Adapter',
        body: 'If you see this, browser notifications are working.',
        onClick: () => { void router.push('/') },
      })
    }
  })
}

// ─── Tab loading ──────────────────────────────────────────────────────────────
async function switchTab(tab: TabKey) {
  activeTab.value = tab
  void router.replace({ query: tab === 'profile' ? {} : { tab } })
  if (tab === 'emails' && aliases.value.length === 0) await loadAliases()
  if (tab === 'domains' && domains.value.length === 0) await loadDomains()
  if (tab === 'forwarding' && forwarding.value.length === 0) await loadForwarding()
  if (tab === 'team' && team.value.length === 0) await loadTeam()
}

onMounted(async () => {
  if (!accountStore.accountId) await accountStore.fetchAccount()
  identity.value = loginClient.getUserIdentity() as Identity | null
  if (accountStore.account) {
    afterSendAction.value = accountStore.account.afterSendAction ?? 'keep_active'
    calendarForwardingAddress.value = accountStore.account.defaultCalendarInviteForwardingAddress ?? ''
    emailNotifAddress.value = accountStore.account.notifications?.email?.address ?? ''
    emailNotifEnabled.value = accountStore.account.notifications?.email?.enabled ?? false
    emailNotifFrequency.value = accountStore.account.notifications?.email?.frequency ?? 'daily'
  }
  // Load security profile data eagerly (for Profile tab)
  void loadSecurityProfile()
  // Hydrate active tab from URL
  const VALID_TABS: TabKey[] = [
    'profile',
    'emails',
    'domains',
    'forwarding',
    'compose',
    'team',
  ]
  const tab = route.query.tab as TabKey | undefined
  if (tab && VALID_TABS.includes(tab)) await switchTab(tab)
})

const TABS: { key: TabKey; label: string }[] = [
  { key: 'profile', label: 'Profile' },
  { key: 'emails', label: 'Aliases' },
  { key: 'domains', label: 'Domains' },
  { key: 'forwarding', label: 'Forwarding' },
  { key: 'compose', label: 'Compose' },
  { key: 'team', label: 'Team' },
]
</script>

<template>
  <div>
    <header class="border-b border-ctp-surface0 bg-ctp-mantle px-4 py-3">
      <h1 class="text-lg font-semibold">Settings</h1>
    </header>

    <!-- Tab bar -->
    <div class="border-b border-ctp-surface0 bg-ctp-mantle px-4">
      <div role="tablist" class="flex gap-1 overflow-x-auto">
        <button
          v-for="tab in TABS"
          :key="tab.key"
          role="tab"
          :aria-selected="activeTab === tab.key"
          class="shrink-0 border-b-2 px-3 py-2 text-sm transition-colors"
          :class="
            activeTab === tab.key
              ? 'border-ctp-mauve text-ctp-text'
              : 'border-transparent text-ctp-subtext0 hover:text-ctp-text'
          "
          @click="switchTab(tab.key)"
        >
          {{ tab.label }}
        </button>
      </div>
    </div>

    <main class="mx-auto max-w-2xl px-4 py-6">
      <!-- ── Profile tab ─────────────────────────────────────────────── -->
      <section v-if="activeTab === 'profile'" class="space-y-6">
        <!-- User identity -->
        <div class="flex items-center gap-4">
          <span class="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full ring-2 ring-ctp-surface1">
            <img
              v-if="identity?.picture"
              :src="identity.picture"
              :alt="identity.name ?? 'Profile'"
              class="h-full w-full object-cover"
              referrerpolicy="no-referrer"
            />
            <span
              v-else
              class="flex h-full w-full items-center justify-center bg-ctp-surface1 text-lg font-semibold text-ctp-subtext1"
            >
              {{ (identity?.name ?? identity?.email ?? '?').slice(0, 2).toUpperCase() }}
            </span>
          </span>
          <div class="min-w-0 flex-1">
            <p v-if="identity?.name" class="truncate text-sm font-semibold text-ctp-text">{{ identity.name }}</p>
            <p v-if="identity?.email" class="truncate text-xs text-ctp-subtext0">{{ identity.email }}</p>
          </div>
        </div>

        <!-- Account ID -->
        <div>
          <span class="mb-1 block text-xs font-medium text-ctp-subtext0">Account ID</span>
          <p class="font-mono text-xs text-ctp-subtext0">{{ accountStore.accountId }}</p>
        </div>

        <!-- Notification preferences -->
        <div class="rounded-lg border border-ctp-surface1 p-4">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-medium text-ctp-text">Email notifications</p>
              <p class="text-xs text-ctp-subtext0">
                Receive digest emails about quarantine and alerts
              </p>
            </div>
            <button
              role="switch"
              :aria-checked="emailNotifEnabled"
              :aria-label="emailNotifEnabled ? 'Disable email notifications' : 'Enable email notifications'"
              class="relative inline-flex h-5 w-9 items-center rounded-full transition-colors"
              :class="emailNotifEnabled ? 'bg-ctp-mauve' : 'bg-ctp-surface1'"
              @click="emailNotifEnabled = !emailNotifEnabled"
            >
              <span
                class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
                :class="emailNotifEnabled ? 'translate-x-4' : 'translate-x-0.5'"
              />
            </button>
          </div>

          <div v-if="emailNotifEnabled" class="mt-4 space-y-3">
            <div>
              <label for="notif-address" class="mb-1 block text-xs text-ctp-subtext0">Notification address</label>
              <input
                id="notif-address"
                v-model="emailNotifAddress"
                type="email"
                placeholder="you@example.com"
                class="w-full rounded border border-ctp-surface1 bg-ctp-base px-3 py-1.5 text-sm text-ctp-text focus:border-ctp-mauve focus:outline-none"
              />
            </div>
            <div>
              <span class="mb-1 block text-xs text-ctp-subtext0">Frequency</span>
              <div class="flex gap-2">
                <button
                  v-for="freq in ['instant', 'hourly', 'daily'] as const"
                  :key="freq"
                  :aria-pressed="emailNotifFrequency === freq"
                  class="rounded-full border px-3 py-1 text-xs transition-colors"
                  :class="
                    emailNotifFrequency === freq
                      ? 'border-ctp-mauve bg-ctp-mauve/10 text-ctp-mauve'
                      : 'border-ctp-surface1 text-ctp-subtext0 hover:border-ctp-surface2'
                  "
                  @click="emailNotifFrequency = freq"
                >
                  {{ freq.charAt(0).toUpperCase() + freq.slice(1) }}
                </button>
              </div>
              <p class="mt-1 text-xs text-ctp-subtext0">
                <template v-if="emailNotifFrequency === 'instant'">Sent as each event arrives</template>
                <template v-else-if="emailNotifFrequency === 'hourly'">One digest per hour if anything new</template>
                <template v-else>One daily summary at 8 AM UTC</template>
              </p>
            </div>
          </div>
        </div>

        <div class="flex gap-2">
          <AsyncButton
            :action="saveNotifications"
            class="rounded-lg bg-ctp-mauve px-4 py-2 text-sm font-medium text-ctp-base hover:opacity-90"
          >
            Save preferences
          </AsyncButton>
          <button
            class="rounded-lg border border-ctp-surface1 px-4 py-2 text-sm text-ctp-subtext1 hover:border-ctp-surface2 hover:text-ctp-text"
            @click="sendTestNotification"
          >
            Send test notification
          </button>
        </div>

        <!-- Profile sub-tabs -->
        <div class="border-t border-ctp-surface0 pt-5">
          <nav class="flex gap-2" aria-label="Profile sub-tabs">
            <button
              type="button"
              class="rounded-full px-4 py-1.5 text-sm font-medium transition-colors"
              :class="profileSubTab === 'configuration' ? 'bg-ctp-mauve/15 text-ctp-mauve' : 'text-ctp-subtext0 hover:bg-ctp-surface0 hover:text-ctp-text'"
              @click="profileSubTab = 'configuration'"
            >
              Configuration
            </button>
            <button
              type="button"
              class="rounded-full px-4 py-1.5 text-sm font-medium transition-colors"
              :class="profileSubTab === 'security' ? 'bg-ctp-mauve/15 text-ctp-mauve' : 'text-ctp-subtext0 hover:bg-ctp-surface0 hover:text-ctp-text'"
              @click="profileSubTab = 'security'"
            >
              Security
            </button>
          </nav>
        </div>

        <!-- Configuration sub-tab -->
        <template v-if="profileSubTab === 'configuration'">
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
                @click="startTour({ force: true })"
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

        <!-- Security sub-tab -->
        <template v-if="profileSubTab === 'security'">
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
              v-if="securityProfileError"
              class="mb-3 rounded border border-ctp-red bg-ctp-red/10 px-3 py-2 text-xs text-ctp-red"
            >
              {{ securityProfileError }}
            </div>

            <div
              v-if="securityProfileLoading"
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
                v-for="ident in linkedIdentities"
                :key="ident.connection.userId"
                class="flex items-center justify-between gap-3 py-2.5"
              >
                <div class="flex items-center gap-2.5">
                  <span
                    class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ctp-surface1 text-xs font-medium text-ctp-subtext1"
                  >
                    {{ providerIcon(ident.connection.connectionId) }}
                  </span>
                  <div>
                    <p class="text-sm font-medium text-ctp-text">
                      {{ providerLabel(ident.connection.connectionId) }}
                    </p>
                    <p class="font-mono text-xs text-ctp-subtext0">
                      {{ ident.connection.userId }}
                    </p>
                  </div>
                </div>
                <button
                  class="shrink-0 text-xs text-ctp-red hover:text-ctp-red/80 disabled:cursor-not-allowed disabled:opacity-40"
                  :disabled="!canDisconnect || disconnectPending === ident.connection.userId"
                  :title="!canDisconnect ? 'Cannot disconnect your only login method' : undefined"
                  @click="disconnectIdentity(ident)"
                >
                  {{
                    disconnectPending === ident.connection.userId ? 'Disconnecting…' : 'Disconnect'
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
              v-if="securityDeviceError"
              class="mb-3 rounded border border-ctp-red bg-ctp-red/10 px-3 py-2 text-xs text-ctp-red"
            >
              {{ securityDeviceError }}
            </div>

            <div
              v-if="securityDevicesLoading"
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
              v-else-if="securityDevices.length === 0"
              class="rounded-lg border border-dashed border-ctp-surface1 py-6 text-center"
            >
              <p class="text-sm text-ctp-subtext1">No passkeys registered</p>
              <p class="mt-1 text-xs text-ctp-subtext0">
                Add a passkey to sign in faster and more securely.
              </p>
            </div>

            <ul v-else class="divide-y divide-ctp-surface0">
              <li
                v-for="device in securityDevices"
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
      </section>

      <!-- ── Email addresses tab ────────────────────────────────────────── -->
      <section v-else-if="activeTab === 'emails'">
        <div
          v-if="aliasError"
          class="mb-4 rounded border border-ctp-red bg-ctp-red/10 px-3 py-2 text-xs text-ctp-red"
        >
          {{ aliasError }}
        </div>
        <!-- Account-level filtering defaults -->
        <div class="mb-6 divide-y divide-ctp-surface0 rounded-lg border border-ctp-surface1 bg-ctp-mantle">
          <!-- Default filter mode -->
          <div class="flex items-center justify-between gap-4 p-4">
            <div>
              <p class="text-sm font-medium text-ctp-text">Default filter mode</p>
              <p class="mt-0.5 text-xs text-ctp-subtext0">Applied to aliases that don't have a specific policy set</p>
            </div>
            <button
              type="button"
              class="rounded-lg border border-ctp-surface1 bg-ctp-mantle px-3 py-1.5 text-xs text-ctp-text transition-colors hover:border-ctp-mauve"
              @click="defaultPolicyModalOpen = true"
            >
              {{ FILTER_MODES.find((m) => m.value === (accountStore.account?.filtering?.defaultUnknownSenderPolicy ?? 'quarantine_visible'))?.label }}
            </button>
          </div>
          <!-- New address handling -->
          <div class="flex items-center justify-between gap-4 p-4">
            <div>
              <p class="text-sm font-medium text-ctp-text">New address handling</p>
              <p class="mt-0.5 text-xs text-ctp-subtext0">What happens when an email arrives for an address not yet in your alias list</p>
            </div>
            <button
              type="button"
              class="rounded-lg border border-ctp-surface1 bg-ctp-mantle px-3 py-1.5 text-xs text-ctp-text transition-colors hover:border-ctp-mauve"
              @click="newAddressHandlingModalOpen = true"
            >
              {{ NEW_ADDRESS_HANDLING_MODES.find((m) => m.value === (accountStore.account?.filtering?.newAddressHandling ?? 'auto_allow'))?.label }}
            </button>
          </div>
          <!-- Account-level spam threshold -->
          <div class="p-4">
            <p class="mb-0.5 text-sm font-medium text-ctp-text">Default spam threshold</p>
            <p class="mb-3 text-xs text-ctp-subtext0">Used by aliases that haven't set their own threshold</p>
            <div class="flex items-center gap-1">
              <button
                v-for="n in 10"
                :key="n"
                type="button"
                class="flex h-7 w-7 items-center justify-center rounded text-xs font-medium transition-colors"
                :class="
                  accountStore.account?.filtering?.spamScoreThreshold === n
                    ? 'bg-ctp-mauve text-ctp-base'
                    : 'bg-ctp-surface0 text-ctp-subtext1 hover:bg-ctp-surface1 hover:text-ctp-text'
                "
                @click="updateAccountSpamThreshold(String(n))"
              >
                {{ n }}
              </button>
              <button
                v-if="accountStore.account?.filtering?.spamScoreThreshold != null"
                class="ml-2 text-xs text-ctp-subtext0 hover:text-ctp-text"
                @click="updateAccountSpamThreshold('')"
              >
                Reset
              </button>
            </div>
            <p class="mt-1.5 text-xs text-ctp-subtext0">
              <template v-if="accountStore.account?.filtering?.spamScoreThreshold == null">No account default — each alias decides independently</template>
              <template v-else-if="accountStore.account.filtering.spamScoreThreshold <= 3">Very aggressive — most emails from unknown senders will be quarantined</template>
              <template v-else-if="accountStore.account.filtering.spamScoreThreshold <= 6">Balanced — catches obvious spam while allowing most legitimate mail</template>
              <template v-else-if="accountStore.account.filtering.spamScoreThreshold <= 9">Permissive — only flags the most obvious spam</template>
              <template v-else>Disabled — no spam filtering</template>
            </p>
          </div>
        </div>
        <!-- Add address -->
        <form class="mb-4 flex gap-2" @submit.prevent="addAddress">
          <input
            v-model="newAddress"
            type="email"
            aria-label="New email address"
            placeholder="you@domain.com"
            class="flex-1 rounded-lg border border-ctp-surface1 bg-ctp-mantle px-3 py-2 text-sm text-ctp-text placeholder:text-ctp-subtext0 focus:border-ctp-mauve focus:outline-none"
          />
          <AsyncButton
            type="submit"
            :action="addAddress"
            :disabled="!newAddress.trim()"
            class="rounded-lg bg-ctp-mauve px-4 py-2 text-sm font-medium text-ctp-base hover:opacity-90"
          >
            Add
          </AsyncButton>
        </form>

        <div
          v-if="aliasesLoading"
          role="status"
          aria-label="Loading addresses…"
          class="animate-pulse divide-y divide-ctp-surface0 rounded-lg border border-ctp-surface0"
        >
          <div v-for="i in 3" :key="i" class="flex items-center gap-3 px-4 py-3">
            <div class="flex-1 space-y-1">
              <div class="h-4 rounded bg-ctp-surface1" :style="{ width: `${40 + (i * 19) % 40}%` }" />
              <div class="h-3 w-20 rounded bg-ctp-surface1" />
            </div>
            <div class="h-6 w-16 shrink-0 rounded-full bg-ctp-surface1" />
            <div class="h-6 w-6 shrink-0 rounded bg-ctp-surface1" />
          </div>
        </div>
        <div
          v-else-if="aliases.length === 0"
          class="rounded-lg border border-dashed border-ctp-surface1 px-6 py-10 text-center text-sm text-ctp-subtext0"
        >
          <p class="font-medium text-ctp-text">No receiving addresses yet</p>
          <p class="mx-auto mt-1 max-w-sm">
            Add an address and emails sent to it will start flowing in. Each address gets its own
            filter mode — so you stay in control of who reaches you.
          </p>
        </div>
        <div v-else class="divide-y divide-ctp-surface0 rounded-lg border border-ctp-surface0">
          <div v-for="alias in aliases" :key="alias.alias" class="px-4 py-3">
            <div class="flex items-center justify-between gap-2">
              <p class="text-sm font-medium text-ctp-text">{{ alias.address }}</p>
              <button
                class="text-xs text-ctp-red hover:text-ctp-red/80"
                @click="deleteAddress(alias.address)"
              >
                Remove
              </button>
            </div>
            <div class="mt-2">
              <button
                type="button"
                class="rounded-lg border border-ctp-surface1 bg-ctp-mantle px-3 py-1.5 text-xs text-ctp-text transition-colors hover:border-ctp-mauve"
                @click="filterModalAlias = alias; filterModalOpen = true"
              >
                {{ FILTER_MODES.find((m) => m.value === alias.unknownSenderPolicy)?.label ?? alias.unknownSenderPolicy }}
              </button>
            </div>
            <div class="mt-3">
              <span class="mb-1.5 block text-xs text-ctp-subtext0">Spam threshold</span>
              <div class="flex items-center gap-1">
                <button
                  v-for="n in 10"
                  :key="n"
                  type="button"
                  class="flex h-7 w-7 items-center justify-center rounded text-xs font-medium transition-colors"
                  :class="
                    alias.spamScoreThreshold === n
                      ? 'bg-ctp-mauve text-ctp-base'
                      : 'bg-ctp-surface0 text-ctp-subtext1 hover:bg-ctp-surface1 hover:text-ctp-text'
                  "
                  @click="updateAliasThreshold(alias.address, String(n))"
                >
                  {{ n }}
                </button>
                <button
                  v-if="alias.spamScoreThreshold != null"
                  class="ml-2 text-xs text-ctp-subtext0 hover:text-ctp-text"
                  @click="updateAliasThreshold(alias.address, '')"
                >
                  Reset
                </button>
              </div>
              <p class="mt-1.5 text-xs text-ctp-subtext0">
                <template v-if="alias.spamScoreThreshold == null">Using account default threshold</template>
                <template v-else-if="alias.spamScoreThreshold <= 3">Very aggressive — most emails from unknown senders will be quarantined</template>
                <template v-else-if="alias.spamScoreThreshold <= 6">Balanced — catches obvious spam while allowing most legitimate mail</template>
                <template v-else-if="alias.spamScoreThreshold <= 9">Permissive — only flags the most obvious spam</template>
                <template v-else>Disabled — no spam filtering</template>
              </p>
            </div>
          </div>
        </div>
      </section>

      <!-- ── Domains tab ────────────────────────────────────────────────── -->
      <section v-else-if="activeTab === 'domains'">
        <form class="mb-4 flex gap-2" @submit.prevent="addDomain">
          <input
            v-model="newDomain"
            type="text"
            aria-label="Domain name"
            placeholder="yourdomain.com"
            class="flex-1 rounded-lg border border-ctp-surface1 bg-ctp-mantle px-3 py-2 text-sm text-ctp-text placeholder:text-ctp-subtext0 focus:border-ctp-mauve focus:outline-none"
          />
          <AsyncButton
            type="submit"
            :action="addDomain"
            :disabled="!newDomain.trim()"
            class="rounded-lg bg-ctp-mauve px-4 py-2 text-sm font-medium text-ctp-base hover:opacity-90"
          >
            Add domain
          </AsyncButton>
        </form>

        <div
          v-if="domainsLoading"
          role="status"
          aria-label="Loading domains…"
          class="animate-pulse space-y-3"
        >
          <div v-for="i in 2" :key="i" class="rounded-lg border border-ctp-surface1 p-4">
            <div class="flex items-center justify-between">
              <div class="space-y-1.5">
                <div class="h-4 rounded bg-ctp-surface1" :style="{ width: `${120 + i * 40}px` }" />
                <div class="h-3 w-20 rounded bg-ctp-surface1" />
              </div>
              <div class="h-6 w-20 shrink-0 rounded-full bg-ctp-surface1" />
            </div>
          </div>
        </div>
        <div
          v-else-if="domains.length === 0"
          class="rounded-lg border border-dashed border-ctp-surface1 px-6 py-10 text-center text-sm text-ctp-subtext0"
        >
          <p class="font-medium text-ctp-text">No domain connected yet</p>
          <p class="mx-auto mt-1 max-w-sm">
            Add your domain above and we'll generate the DNS records. Once you paste them into your
            DNS provider, email starts flowing — usually within minutes.
          </p>
        </div>
        <div v-else class="space-y-4">
          <div
            v-for="domain in domains"
            :key="domain.domainId"
            class="rounded-lg border border-ctp-surface1"
          >
            <!-- Domain header -->
            <div class="flex items-center justify-between gap-2 px-4 py-3">
              <div>
                <p class="text-sm font-medium text-ctp-text">{{ domain.domain }}</p>
                <div class="mt-1 flex flex-wrap gap-1.5">
                  <span
                    class="rounded-full px-2 py-0.5 text-xs font-medium"
                    :class="domain.receivingSetupComplete ? 'bg-ctp-green/10 text-ctp-green' : 'bg-ctp-yellow/10 text-ctp-yellow'"
                  >
                    Receiving {{ domain.receivingSetupComplete ? '✓' : 'pending' }}
                  </span>
                  <span
                    class="rounded-full px-2 py-0.5 text-xs font-medium"
                    :class="domain.senderSetupComplete ? 'bg-ctp-green/10 text-ctp-green' : 'bg-ctp-yellow/10 text-ctp-yellow'"
                  >
                    Sending {{ domain.senderSetupComplete ? '✓' : 'pending' }}
                  </span>
                </div>
              </div>
              <AsyncButton
                v-if="!domain.receivingSetupComplete || !domain.senderSetupComplete"
                :action="() => recheckDomain(domain.domainId)"
                variant="outline"
                class="px-3 py-1.5 text-xs text-ctp-subtext1 hover:border-ctp-surface2 hover:text-ctp-text"
              >
                Re-check DNS
              </AsyncButton>
            </div>
            <!-- DNS records — two-tier display -->
            <div v-if="domain.records?.length" class="border-t border-ctp-surface0">
              <div
                v-for="(rec, i) in domain.records"
                :key="i"
                class="border-b border-ctp-surface0/50 px-4 py-2 last:border-0"
              >
                <div class="flex items-start justify-between gap-4">
                  <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-2">
                      <span
                        class="shrink-0 rounded bg-ctp-surface1 px-1.5 py-0.5 font-mono text-xs text-ctp-subtext0"
                        >{{ rec.type }}</span
                      >
                      <span class="truncate font-mono text-xs text-ctp-text">{{ rec.name }}</span>
                    </div>
                    <p class="mt-1 break-all font-mono text-xs text-ctp-subtext0">
                      <span class="text-ctp-subtext1">Expected:</span> {{ rec.value }}
                    </p>
                    <p v-if="rec.currentValue" class="mt-0.5 break-all font-mono text-xs text-ctp-subtext0">
                      <span class="text-ctp-subtext1">Current:</span> {{ rec.currentValue }}
                    </p>
                  </div>
                  <div class="flex shrink-0 items-center gap-2">
                    <span
                      class="text-xs"
                      :class="STATUS_COLORS[rec.status] ?? 'text-ctp-subtext0'"
                    >
                      {{ rec.status }}
                    </span>
                    <button
                      class="rounded border border-ctp-surface1 px-2 py-0.5 text-xs text-ctp-subtext0 transition-colors hover:border-ctp-surface2 hover:text-ctp-text"
                      :title="`Copy ${rec.type} value`"
                      @click="copyDnsValue(`${domain.domainId}-${i}`, rec.value)"
                    >
                      {{ copiedDns.has(`${domain.domainId}-${i}`) ? '✓' : 'Copy' }}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- ── Forwarding tab ─────────────────────────────────────────────── -->
      <section v-else-if="activeTab === 'forwarding'">
        <!-- Calendar forwarding address -->
        <div class="mb-6 rounded-lg border border-ctp-surface1 p-4">
          <label for="calendar-forwarding" class="mb-1 block text-xs font-medium text-ctp-subtext0">Calendar invite forwarding</label>
          <p class="mb-2 text-xs text-ctp-subtext0">Calendar invites will be automatically forwarded to this address</p>
          <div class="flex gap-2">
            <input
              id="calendar-forwarding"
              v-model="calendarForwardingAddress"
              type="email"
              placeholder="calendar@example.com"
              class="flex-1 rounded-lg border border-ctp-surface1 bg-ctp-mantle px-3 py-2 text-sm text-ctp-text placeholder:text-ctp-overlay0 focus:border-ctp-mauve focus:outline-none"
            />
            <AsyncButton
              :action="saveCalendarForwarding"
              class="rounded-lg bg-ctp-mauve px-4 py-2 text-sm font-medium text-ctp-base hover:opacity-90"
            >
              Save
            </AsyncButton>
          </div>
        </div>

        <form
          class="mb-4 grid gap-2 sm:grid-cols-[1fr_1fr_auto]"
          @submit.prevent="addForwardingAddress"
        >
          <input
            v-model="newForwardAddress"
            type="email"
            aria-label="Forwarding address"
            placeholder="forward@example.com"
            class="rounded-lg border border-ctp-surface1 bg-ctp-mantle px-3 py-2 text-sm text-ctp-text placeholder:text-ctp-overlay0 focus:border-ctp-mauve focus:outline-none"
          />
          <AsyncButton
            type="submit"
            :action="addForwardingAddress"
            :disabled="!newForwardAddress.trim()"
            class="rounded-lg bg-ctp-mauve px-4 py-2 text-sm font-medium text-ctp-base hover:opacity-90"
          >
            Add
          </AsyncButton>
        </form>

        <div
          v-if="forwardingLoading"
          role="status"
          aria-label="Loading forwarding addresses…"
          class="animate-pulse divide-y divide-ctp-surface0 rounded-lg border border-ctp-surface0"
        >
          <div v-for="i in 2" :key="i" class="flex items-center gap-3 px-4 py-3">
            <div class="h-4 rounded bg-ctp-surface1" :style="{ width: `${130 + i * 50}px` }" />
            <div class="ml-auto h-6 w-6 shrink-0 rounded bg-ctp-surface1" />
          </div>
        </div>
        <div
          v-else-if="forwarding.length === 0"
          class="rounded-lg border border-dashed border-ctp-surface1 px-6 py-10 text-center text-sm text-ctp-subtext0"
        >
          <p class="font-medium text-ctp-text">No forwarding addresses yet</p>
          <p class="mx-auto mt-1 max-w-sm">
            Forwarding lets you send matched emails to another inbox automatically. Add a
            destination here, then wire it up in a rule — useful for team handoffs or archiving to
            a shared mailbox.
          </p>
        </div>
        <div v-else class="divide-y divide-ctp-surface0 rounded-lg border border-ctp-surface0">
          <div
            v-for="fwd in forwarding"
            :key="fwd.address"
            class="flex items-center justify-between px-4 py-3"
          >
            <div>
              <p class="text-sm text-ctp-text">{{ fwd.address }}</p>
              <p v-if="fwd.verifiedAt" class="text-xs text-ctp-green">
                Verified on {{ new Date(fwd.verifiedAt).toLocaleDateString(undefined, { dateStyle: 'medium' }) }}
              </p>
              <p v-else class="text-xs text-ctp-yellow">Pending verification</p>
            </div>
            <button
              class="text-xs text-ctp-red hover:text-ctp-red/80"
              @click="removeForwarding(fwd.address)"
            >
              Remove
            </button>
          </div>
        </div>
      </section>

      <!-- ── Compose tab ──────────────────────────────────────────────── -->
      <section v-else-if="activeTab === 'compose'" class="space-y-6">
        <div>
          <span class="mb-1 block text-xs font-medium text-ctp-subtext0">After send</span>
          <p class="mb-2 text-xs text-ctp-subtext0">What happens to the conversation after you send a reply</p>
          <div class="flex gap-2">
            <AsyncButton
              v-for="option in [{ value: 'archive' as const, label: 'Archive' }, { value: 'keep_active' as const, label: 'Keep active' }]"
              :key="option.value"
              :action="() => updateAfterSendAction(option.value)"
              variant="ghost"
              :aria-pressed="afterSendAction === option.value"
              class="rounded-full border px-3 py-1 text-xs"
              :class="
                afterSendAction === option.value
                  ? 'border-ctp-mauve bg-ctp-mauve/10 text-ctp-mauve'
                  : 'border-ctp-surface1 text-ctp-subtext0 hover:border-ctp-surface2 hover:text-ctp-text'
              "
            >
              {{ option.label }}
            </AsyncButton>
          </div>
        </div>
      </section>

      <!-- ── Team tab ───────────────────────────────────────────────────── -->
      <section v-else-if="activeTab === 'team'">
        <div
          v-if="teamError"
          class="mb-4 rounded border border-ctp-red bg-ctp-red/10 px-3 py-2 text-xs text-ctp-red"
        >
          {{ teamError }}
        </div>
        <!-- Invite form -->
        <form class="mb-4 grid gap-2 sm:grid-cols-[1fr_auto_auto]" @submit.prevent="inviteMember">
          <input
            v-model="inviteEmail"
            type="email"
            aria-label="Invite email address"
            placeholder="colleague@example.com"
            class="rounded-lg border border-ctp-surface1 bg-ctp-mantle px-3 py-2 text-sm text-ctp-text placeholder:text-ctp-subtext0 focus:border-ctp-mauve focus:outline-none"
          />
          <div class="flex flex-col gap-1">
            <select
              v-model="inviteRole"
              aria-label="Role"
              class="rounded-lg border border-ctp-surface1 bg-ctp-mantle px-3 py-2 text-sm text-ctp-text focus:border-ctp-mauve focus:outline-none"
            >
              <option v-for="role in ROLES" :key="role" :value="role">{{ role }}</option>
            </select>
            <p class="text-xs text-ctp-subtext0">{{ ROLE_DESCRIPTIONS[inviteRole] }}</p>
          </div>
          <AsyncButton
            type="submit"
            :action="inviteMember"
            :disabled="!inviteEmail.trim()"
            class="self-start rounded-lg bg-ctp-mauve px-4 py-2 text-sm font-medium text-ctp-base hover:opacity-90"
          >
            Invite
          </AsyncButton>
        </form>

        <div
          v-if="teamLoading"
          role="status"
          aria-label="Loading team…"
          class="animate-pulse divide-y divide-ctp-surface0 rounded-lg border border-ctp-surface0"
        >
          <div v-for="i in 3" :key="i" class="flex items-center gap-3 px-4 py-3">
            <div class="h-8 w-8 shrink-0 rounded-full bg-ctp-surface1" />
            <div class="flex-1 space-y-1">
              <div class="h-4 rounded bg-ctp-surface1" :style="{ width: `${100 + i * 40}px` }" />
              <div class="h-3 w-28 rounded bg-ctp-surface1" />
            </div>
            <div class="h-5 w-16 shrink-0 rounded-full bg-ctp-surface1" />
          </div>
        </div>
        <div
          v-else-if="team.length === 0"
          class="rounded-lg border border-dashed border-ctp-surface1 px-6 py-10 text-center text-sm text-ctp-subtext0"
        >
          <p class="font-medium text-ctp-text">Just you for now</p>
          <p class="mx-auto mt-1 max-w-sm">
            Invite teammates to share access — each person gets their own role so you control
            exactly what they can see and do.
          </p>
        </div>
        <div v-else class="divide-y divide-ctp-surface0 rounded-lg border border-ctp-surface0">
          <div v-for="member in team" :key="member.userId" class="flex items-center gap-3 px-4 py-3">
            <img
              v-if="member.picture"
              :src="member.picture"
              :alt="member.name ?? member.userId"
              class="h-8 w-8 shrink-0 rounded-full object-cover"
            />
            <div v-else class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ctp-surface1 text-xs font-medium text-ctp-subtext1">
              {{ (member.name ?? member.email ?? member.userId).charAt(0).toUpperCase() }}
            </div>
            <div class="flex-1">
              <p class="text-sm font-medium text-ctp-text">{{ member.name ?? member.userId }}</p>
              <p v-if="member.email" class="text-xs text-ctp-subtext0">{{ member.email }}</p>
            </div>
            <select
              :value="member.role"
              :aria-label="`Role for ${member.userId}`"
              class="rounded border border-ctp-surface1 bg-ctp-base px-2 py-1.5 text-xs text-ctp-text focus:border-ctp-mauve focus:outline-none"
              @change="
                updateMemberRole(
                  member.userId,
                  ($event.target as HTMLSelectElement).value as UserRole,
                )
              "
            >
              <option v-for="role in ROLES" :key="role" :value="role">{{ role }}</option>
            </select>
            <button
              class="text-xs text-ctp-red hover:text-ctp-red/80"
              @click="removeMember(member.userId, member.name ?? member.email ?? member.userId)"
            >
              Remove
            </button>
          </div>
        </div>
      </section>

    </main>

    <ConfirmDialog
      :open="dialogOpen"
      :title="dialogOptions.title"
      :message="dialogOptions.message"
      :confirm-label="dialogOptions.confirmLabel"
      :confirm-variant="dialogOptions.confirmVariant"
      @confirm="onConfirm"
      @cancel="onCancel"
    />

    <FilterModeModal
      :open="filterModalOpen"
      :title="`Filter mode for ${filterModalAlias?.address ?? ''}`"
      :current-mode="filterModalAlias?.unknownSenderPolicy ?? 'quarantine_visible'"
      :modes="FILTER_MODES"
      @select="(mode) => { if (filterModalAlias) { updateAliasMode(filterModalAlias.address, mode as UnknownSenderPolicy); filterModalAlias = { ...filterModalAlias, unknownSenderPolicy: mode as UnknownSenderPolicy } } }"
      @close="filterModalOpen = false"
    />

    <FilterModeModal
      :open="defaultPolicyModalOpen"
      title="Account default filter mode"
      subtitle="Applied to aliases that don't have a specific policy set."
      :current-mode="accountStore.account?.filtering?.defaultUnknownSenderPolicy ?? 'quarantine_visible'"
      :modes="FILTER_MODES"
      @select="(mode) => updateDefaultPolicy(mode as UnknownSenderPolicy)"
      @close="defaultPolicyModalOpen = false"
    />

    <FilterModeModal
      :open="newAddressHandlingModalOpen"
      title="New address handling"
      subtitle="What happens when an email arrives for an address not yet in your alias list."
      :current-mode="accountStore.account?.filtering?.newAddressHandling ?? 'auto_allow'"
      :modes="NEW_ADDRESS_HANDLING_MODES"
      @select="(mode) => updateNewAddressHandling(mode as 'auto_allow' | 'block_until_approved')"
      @close="newAddressHandlingModalOpen = false"
    />
  </div>
</template>

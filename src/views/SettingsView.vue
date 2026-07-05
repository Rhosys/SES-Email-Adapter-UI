<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAccountStore } from '@/stores/account'
import { useUserConfigStore } from '@/stores/userConfig'
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
import SettingsTabBar from '@/components/settings/SettingsTabBar.vue'
import BillingPanel from '@/components/settings/BillingPanel.vue'
import BuildInfo from '@/components/BuildInfo.vue'
import { useGestureHandler } from '@/composables/useGestureHandler'
import { useConfirmDialog } from '@/composables/useConfirmDialog'
import { useToast } from '@/composables/useToast'
import type {
  Domain,
  DnsRecord,
  Alias,
  AliasSender,
  SenderPolicy,
  ForwardingTarget,
  UnknownSenderPolicy,
  TeamMember,
  UserRole,
  RetentionDuration,
} from '@/types/server'

const route = useRoute()
const router = useRouter()
const accountStore = useAccountStore()
const userConfigStore = useUserConfigStore()
const { dialogOpen, dialogOptions, confirm: confirmAction, onConfirm, onCancel } = useConfirmDialog()
const { deferAction } = useToast()

type TabKey = 'profile' | 'emails' | 'domains' | 'forwarding' | 'email' | 'team' | 'billing'
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
const calendarForwardingTargetId = ref('')
const calendarForwardingPending = ref(false)
const calendarForwardingSaved = ref(false)

async function saveCalendarForwarding() {
  if (!accountStore.accountId) return
  calendarForwardingPending.value = true
  calendarForwardingSaved.value = false
  const result = await api.updateAccount(accountStore.accountId, {
    defaultCalendarInviteForwardingTargetId: calendarForwardingTargetId.value.trim() || undefined,
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

// ─── Retention duration (Email tab) ──────────────────────────────────────────
interface RetentionOption {
  value: RetentionDuration
  label: string
  minPlan: 'free' | 'pro' | 'premium'
}

const RETENTION_OPTIONS: RetentionOption[] = [
  { value: 'P1M', label: '1 month', minPlan: 'free' },
  { value: 'P2M', label: '2 months', minPlan: 'free' },
  { value: 'P3M', label: '3 months', minPlan: 'free' },
  { value: 'P5M', label: '5 months', minPlan: 'free' },
  { value: 'P6M', label: '6 months', minPlan: 'free' },
  { value: 'P1Y', label: '1 year', minPlan: 'pro' },
  { value: 'P2Y', label: '2 years', minPlan: 'pro' },
  { value: 'P5Y', label: '5 years', minPlan: 'pro' },
  { value: 'P10Y', label: '10 years', minPlan: 'pro' },
  { value: 'Infinity', label: 'Forever', minPlan: 'premium' },
]

const PLAN_RANK: Record<string, number> = { free: 0, starter: 1, pro: 2, premium: 3 }

const currentPlanRank = computed(() => {
  const plan = accountStore.account?.billingPlan ?? 'free'
  return PLAN_RANK[plan] ?? 0
})

const retentionOptions = computed(() =>
  RETENTION_OPTIONS.map((opt) => ({
    ...opt,
    available: currentPlanRank.value >= (PLAN_RANK[opt.minPlan] ?? 0),
    badge: opt.minPlan !== 'free' ? opt.minPlan.charAt(0).toUpperCase() + opt.minPlan.slice(1) : null,
  })),
)

const selectedRetention = ref<RetentionDuration | undefined>(undefined)
const retentionPending = ref(false)
const retentionUpgradePrompt = ref(false)

async function updateRetention(value: RetentionDuration) {
  const opt = retentionOptions.value.find((o) => o.value === value)
  if (!opt?.available) {
    retentionUpgradePrompt.value = true
    return
  }
  if (!accountStore.accountId) return
  retentionUpgradePrompt.value = false
  retentionPending.value = true
  const result = await api.updateAccount(accountStore.accountId, { retentionDuration: value })
  retentionPending.value = false
  if (result.isOk()) {
    accountStore.account = result.value
    selectedRetention.value = value
  }
}

// ─── Email addresses tab ──────────────────────────────────────────────────────
const aliases = ref<Alias[]>([])
const aliasesLoading = ref(false)
const aliasError = ref('')
const newAddress = ref('')
const newAddressPending = ref(false)
const aliasSearch = ref('')
const addAliasModalOpen = ref(false)
const expandedAlias = ref<string | null>(null)

// ─── Senders per alias (lazy-loaded on expand) ────────────────────────────────
const aliasSenders = ref<Map<string, AliasSender[]>>(new Map())
const aliasSendersLoading = ref<Set<string>>(new Set())

const SENDER_POLICIES: { value: SenderPolicy; label: string; description: string }[] = [
  { value: 'allow', label: 'Allow', description: 'Emails from this sender are delivered normally' },
  { value: 'block_hidden', label: 'Block', description: 'Emails are silently discarded' },
  { value: 'block_reject', label: 'Block & bounce', description: 'Emails are rejected and sender receives a bounce' },
  { value: 'report_violation', label: 'Report violation', description: 'Emails are rejected and reported as abuse' },
]

async function loadSendersForAlias(address: string) {
  if (!accountStore.accountId) return
  if (aliasSenders.value.has(address)) return
  aliasSendersLoading.value.add(address)
  const result = await api.listAliasSenders(accountStore.accountId, address)
  aliasSendersLoading.value.delete(address)
  if (result.isOk()) {
    aliasSenders.value.set(address, result.value)
  }
}

async function updateSenderPolicy(address: string, senderDomain: string, policy: SenderPolicy) {
  if (!accountStore.accountId) return
  const result = await api.updateAliasSender(accountStore.accountId, address, senderDomain, { policy })
  if (result.isOk()) {
    const current = aliasSenders.value.get(address) ?? []
    aliasSenders.value.set(address, current.map((s) => (s.sender === senderDomain ? result.value : s)))
  }
}

async function removeSender(address: string, senderDomain: string) {
  if (!accountStore.accountId) return
  const result = await api.removeAliasSender(accountStore.accountId, address, senderDomain)
  if (result.isOk()) {
    const current = aliasSenders.value.get(address) ?? []
    aliasSenders.value.set(address, current.filter((s) => s.sender !== senderDomain))
  }
}

function toggleAliasExpand(address: string) {
  if (expandedAlias.value === address) {
    expandedAlias.value = null
  } else {
    expandedAlias.value = address
    loadSendersForAlias(address)
  }
}

const filteredAliases = computed(() => {
  if (!aliasSearch.value.trim()) return aliases.value
  const q = aliasSearch.value.toLowerCase()
  return aliases.value.filter((a) => a.address.toLowerCase().includes(q))
})

const filterModalOpen = ref(false)
const filterModalAlias = ref<Alias | null>(null)
const defaultPolicyModalOpen = ref(false)

const FILTER_MODES: { value: UnknownSenderPolicy; label: string; description: string }[] = [
  { value: 'allow_all', label: 'Allow all', description: 'All senders pass through' },
  { value: 'quarantine_visible', label: 'Quarantine and notify', description: 'Unknown senders held for review, you get notified' },
  { value: 'quarantine_hidden', label: 'Quarantine', description: 'Unknown senders silently held for review' },
  { value: 'block_hidden', label: 'Block email', description: 'Unknown senders silently discarded' },
  { value: 'block_reject', label: 'Block and deny', description: 'Unknown senders receive a bounce' },
  { value: 'report_violation', label: 'Report Violation', description: 'Report as a policy violation' },
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
    addAliasModalOpen.value = false
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

async function updateDefaultPolicy(policy: UnknownSenderPolicy) {
  if (!accountStore.accountId) return
  const result = await api.updateAccount(accountStore.accountId, {
    filtering: { ...accountStore.account?.filtering, defaultUnknownSenderPolicy: policy },
  })
  if (result.isOk()) accountStore.account = result.value
}

async function deleteAddress(address: string) {
  if (!accountStore.accountId) return
  const accountDefaultPolicy = accountStore.account?.filtering.defaultUnknownSenderPolicy ?? 'quarantine_visible'
  const accountDefaultPolicyLabel = FILTER_MODES.find((m) => m.value === accountDefaultPolicy)?.label ?? accountDefaultPolicy
  const confirmed = await confirmAction({
    title: `Delete ${address}`,
    message: `Emails sent to this alias will be handled by your account default policy (${accountDefaultPolicyLabel}).`,
    confirmLabel: 'Delete',
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
const domainMenuOpen = ref<string | null>(null)
const senderPolicyModal = ref<{ open: boolean; aliasAddress: string; senderDomain: string; currentPolicy: SenderPolicy }>({
  open: false, aliasAddress: '', senderDomain: '', currentPolicy: 'allow',
})

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

async function deleteDomain(domainId: string) {
  if (!accountStore.accountId) return
  const domainObj = domains.value.find((d) => d.domainId === domainId)
  if (!domainObj) return

  // Step 1: Warning dialog
  const warned = await confirmAction({
    title: "You Don\u2019t Really Want to Delete This Domain",
    message: 'Deleting domains will prevent you from receiving All Mail to this domain. Instead you almost certainly want to block mail for just one alias or even from just one sender.',
    confirmLabel: 'Delete anyway',
    confirmVariant: 'danger',
  })
  if (!warned) return

  // Step 2: Type-to-confirm
  const confirmed = await confirmAction({
    title: `Confirm deletion of ${domainObj.domain}`,
    message: 'This action is irreversible. All aliases on this domain will be deleted and DNS configuration removed.',
    confirmLabel: 'Delete',
    confirmVariant: 'danger',
    requireInput: domainObj.domain,
    requireInputLabel: `Type "${domainObj.domain}" to confirm deletion`,
  })
  if (!confirmed) return

  domains.value = domains.value.filter((d) => d.domainId !== domainId)
  const acctId = accountStore.accountId
  deferAction('Domain deleted', async () => {
    await api.deleteDomain(acctId, domainId)
  }, 8000, {
    onUndo: () => { domains.value = [...domains.value, domainObj] },
  })
}

const STATUS_COLORS: Record<string, string> = {
  verified: 'text-ctp-green',
  pending: 'text-ctp-yellow',
  failing: 'text-ctp-red',
}

// ─── Forwarding addresses tab ─────────────────────────────────────────────────
const forwarding = ref<ForwardingTarget[]>([])
const forwardingLoading = ref(false)
const addForwardPending = ref(false)
const verifySuccess = ref('')
const verifyError = ref('')
const addTargetDialogOpen = ref(false)
const addTargetType = ref<'email' | 'webhook' | null>(null)
const newForwardTarget = ref('')

async function loadForwarding() {
  if (!accountStore.accountId) return
  forwardingLoading.value = true
  const result = await api.listForwardingAddresses(accountStore.accountId)
  forwardingLoading.value = false
  if (result.isOk()) forwarding.value = result.value
}

async function addForwardingTarget() {
  if (!accountStore.accountId || !newForwardTarget.value.trim() || !addTargetType.value) return
  addForwardPending.value = true
  const result = await api.createForwardingAddress(accountStore.accountId, {
    target: newForwardTarget.value.trim(),
    type: addTargetType.value,
  })
  addForwardPending.value = false
  if (result.isOk()) {
    forwarding.value = [...forwarding.value, result.value]
    newForwardTarget.value = ''
    addTargetType.value = null
    addTargetDialogOpen.value = false
  }
}

async function removeForwarding(target: string) {
  if (!accountStore.accountId) return
  const result = await api.deleteForwardingAddress(accountStore.accountId, target)
  if (result.isOk()) forwarding.value = forwarding.value.filter((f) => f.target !== target)
}

const verifiedForwardingTargets = computed(() => forwarding.value.filter((f) => f.status === 'verified'))

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

// ─── User ID copy ─────────────────────────────────────────────────────────────
const userIdCopied = ref(false)

function copyUserId() {
  const id = identity.value?.userId ?? identity.value?.sub
  if (!id) return
  void navigator.clipboard.writeText(id).then(() => {
    userIdCopied.value = true
    setTimeout(() => { userIdCopied.value = false }, 1500)
  })
}

const signingOut = ref(false)

async function signOut() {
  signingOut.value = true
  // Land on the public site root (the marketing/landing page), not the app's
  // deploy base path — a signed-out user has nothing to see inside the app.
  await loginClient.logout(`${window.location.origin}/`)
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

// ─── Digest (Email tab) ───────────────────────────────────────────────────────
const digestFrequency = ref<'daily' | 'weekly' | 'monthly' | null>(null)
const digestForwardingTargetId = ref('')
const digestPending = ref(false)
const digestSaved = ref(false)

async function saveDigest() {
  if (!accountStore.accountId) return
  digestPending.value = true
  digestSaved.value = false
  const digest = digestFrequency.value
    ? { frequency: digestFrequency.value, forwardingTargetId: digestForwardingTargetId.value }
    : null
  const result = await api.updateAccount(accountStore.accountId, { digest })
  digestPending.value = false
  if (result.isOk()) {
    accountStore.account = result.value
    digestSaved.value = true
    setTimeout(() => { digestSaved.value = false }, 2000)
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
  if (tab === 'profile' && forwarding.value.length === 0) await loadForwarding()
  if (tab === 'team' && team.value.length === 0) await loadTeam()
}

onMounted(async () => {
  identity.value = loginClient.getUserIdentity() as Identity | null
  if (accountStore.account) {
    calendarForwardingTargetId.value = accountStore.account.defaultCalendarInviteForwardingTargetId ?? ''
    selectedRetention.value = accountStore.account.retentionDuration
    digestFrequency.value = accountStore.account.digest?.frequency ?? null
    digestForwardingTargetId.value = accountStore.account.digest?.forwardingTargetId ?? ''
  }
  // Load security profile data eagerly (for Profile tab)
  void loadSecurityProfile()
  // Load forwarding targets eagerly (needed for digest dropdown on Profile tab)
  void loadForwarding()
  // Handle forwarding address verification from email link
  const verifyAddress = route.query.verifyAddress as string | undefined
  const token = route.query.token as string | undefined
  if (verifyAddress && token && accountStore.accountId) {
    const result = await api.verifyForwardingAddress(accountStore.accountId, verifyAddress, token)
    if (result.isOk()) {
      verifySuccess.value = `${verifyAddress} verified successfully`
      await loadForwarding()
    } else {
      verifyError.value = result.error.message || 'Verification failed'
    }
    const { verifyAddress: _va, token: _tk, ...rest } = route.query
    void router.replace({ query: rest })
    activeTab.value = 'forwarding'
  }
  // Hydrate active tab from URL
  const VALID_TABS: TabKey[] = [
    'emails',
    'email',
    'forwarding',
    'domains',
    'profile',
    'team',
    'billing',
  ]
  const tab = route.query.tab as TabKey | undefined
  if (tab && VALID_TABS.includes(tab)) await switchTab(tab)
})

const TABS: { key: TabKey; label: string; description: string }[] = [
  { key: 'emails', label: 'Aliases', description: 'Manage email addresses and sender policies' },
  { key: 'email', label: 'Email', description: 'Compose behavior and retention' },
  { key: 'forwarding', label: 'Forwarding', description: 'Forward emails to external addresses' },
  { key: 'domains', label: 'Domains', description: 'DNS setup and domain verification' },
  { key: 'profile', label: 'Profile', description: 'Your identity, security, and linked accounts' },
  { key: 'team', label: 'Team', description: 'Members, roles, and invitations' },
  { key: 'billing', label: 'Billing', description: 'Manage your plan and payment details' },
]

/** Leave Settings, back to the app. */
function goBack() {
  void router.push('/')
}

/** Move to the tab `dir` steps away in TABS order (mobile swipe). Clamps at ends. */
function switchToAdjacentTab(dir: 1 | -1) {
  const i = TABS.findIndex((t) => t.key === activeTab.value)
  const next = TABS[i + dir]
  if (next) void switchTab(next.key)
}

// Mobile: horizontal swipe across the content moves between adjacent tabs.
// The content region is marked data-h-swipe so AppLayout's swipe-to-open-nav
// yields to it (except a swipe from the very left edge).
const settingsContentRef = ref<HTMLElement | null>(null)
useGestureHandler(settingsContentRef, {
  onSwipe: (dir) => {
    if (dir === 'left') switchToAdjacentTab(1)
    else if (dir === 'right') switchToAdjacentTab(-1)
  },
})
</script>

<template>
  <!-- Mobile: full-height flex column (top bar / scrolling content / bottom tab
       bar). Desktop: normal flow, content scrolls in the app's main region. -->
  <div class="flex h-full flex-col sm:block sm:h-auto">
    <header class="hidden border-b border-ctp-surface0 bg-ctp-mantle px-4 py-3 sm:block">
      <h1 class="text-lg font-semibold">Settings</h1>
    </header>

    <!-- Tab bar (desktop) -->
    <div class="hidden border-b border-ctp-surface0 bg-ctp-mantle px-4 sm:block">
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

    <!-- Top bar (mobile): back to the app. The current section is shown by the
         bottom tab bar, so no title is needed here. -->
    <div class="flex shrink-0 items-center border-b border-ctp-surface0 bg-ctp-mantle px-2 py-2 sm:hidden">
      <button
        type="button"
        class="flex items-center gap-1 px-1 py-1 text-sm text-ctp-subtext1 hover:text-ctp-text"
        @click="goBack"
      >
        <svg class="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M15 5l-7 7 7 7" />
        </svg>
        Back to app
      </button>
    </div>

    <!-- Content. Mobile: the scrolling middle of the flex column, and the owner
         of horizontal swipes (data-h-swipe) which move between adjacent tabs.
         Desktop: normal flow (scrolls in the app's main region). -->
    <main
      ref="settingsContentRef"
      data-h-swipe
      class="mx-auto w-full min-h-0 max-w-2xl flex-1 overflow-y-auto px-4 py-6 sm:flex-none sm:overflow-visible"
    >
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
            <div v-if="identity?.userId ?? identity?.sub" class="mt-1 flex items-center gap-1.5">
              <p class="truncate font-mono text-xs text-ctp-subtext0">{{ identity?.userId ?? identity?.sub }}</p>
              <button
                type="button"
                class="shrink-0 transition-colors"
                :class="userIdCopied ? 'text-ctp-green' : 'text-ctp-subtext0 hover:text-ctp-text'"
                :aria-label="userIdCopied ? 'Copied!' : 'Copy user ID'"
                @click="copyUserId"
              >
                <svg v-if="userIdCopied" class="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M2.5 8.5l4 4 7-7"/>
                </svg>
                <svg v-else class="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path d="M5 2h7a1 1 0 011 1v9" stroke-linecap="round"/>
                  <rect x="2" y="4" width="9" height="10" rx="1"/>
                </svg>
              </button>
            </div>
          </div>
          <button
            type="button"
            :disabled="signingOut"
            class="shrink-0 rounded-lg border border-ctp-surface1 px-3 py-1.5 text-xs text-ctp-subtext0 transition-colors hover:border-ctp-red hover:text-ctp-red disabled:opacity-50"
            @click="signOut"
          >
            <span v-if="signingOut" class="flex items-center gap-1.5">
              <span class="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
              Signing out…
            </span>
            <span v-else>Sign out</span>
          </button>
        </div>

        <!-- Account ID -->
        <div>
          <span class="mb-1 block text-xs font-medium text-ctp-subtext0">Account ID</span>
          <p class="font-mono text-xs text-ctp-subtext0">{{ accountStore.accountId }}</p>
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

          <!-- Email digest -->
          <section class="rounded-lg border border-ctp-surface1 p-4">
            <div class="flex items-center justify-between">
              <div>
                <h2 class="text-sm font-medium text-ctp-text">Email digest</h2>
                <p class="mt-0.5 text-xs text-ctp-subtext0">
                  Receive periodic digest emails about quarantine and alerts
                </p>
              </div>
              <button
                role="switch"
                :aria-checked="digestFrequency !== null"
                :aria-label="digestFrequency ? 'Disable digest' : 'Enable digest'"
                class="relative inline-flex h-5 w-9 items-center rounded-full transition-colors"
                :class="digestFrequency !== null ? 'bg-ctp-mauve' : 'bg-ctp-surface1'"
                @click="digestFrequency = digestFrequency ? null : 'daily'; saveDigest()"
              >
                <span
                  class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
                  :class="digestFrequency !== null ? 'translate-x-4' : 'translate-x-0.5'"
                />
              </button>
            </div>

            <div v-if="digestFrequency !== null" class="mt-4 space-y-3">
              <div>
                <span class="mb-1 block text-xs text-ctp-subtext0">Frequency</span>
                <div class="flex gap-2">
                  <button
                    v-for="freq in ['daily', 'weekly', 'monthly'] as const"
                    :key="freq"
                    :aria-pressed="digestFrequency === freq"
                    class="rounded-full border px-3 py-1 text-xs transition-colors"
                    :class="
                      digestFrequency === freq
                        ? 'border-ctp-mauve bg-ctp-mauve/10 text-ctp-mauve'
                        : 'border-ctp-surface1 text-ctp-subtext0 hover:border-ctp-surface2'
                    "
                    @click="digestFrequency = freq; saveDigest()"
                  >
                    {{ freq.charAt(0).toUpperCase() + freq.slice(1) }}
                  </button>
                </div>
              </div>
              <div>
                <label for="digest-target" class="mb-1 block text-xs text-ctp-subtext0">Send to</label>
                <select
                  id="digest-target"
                  v-model="digestForwardingTargetId"
                  class="w-full appearance-none rounded-lg border border-ctp-surface1 bg-ctp-base px-3 py-2 text-sm text-ctp-text focus:border-ctp-mauve focus:outline-none"
                  @change="saveDigest()"
                >
                  <option value="">Select target…</option>
                  <option
                    v-for="t in verifiedForwardingTargets"
                    :key="t.target"
                    :value="t.target"
                  >
                    {{ t.target }}
                  </option>
                </select>
              </div>
            </div>
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
                  class="text-ctp-subtext0 hover:text-ctp-red disabled:opacity-40"
                  :disabled="removePending === device.deviceId"
                  title="Remove"
                  @click="removeDevice(device)"
                >
                  <svg v-if="removePending !== device.deviceId" class="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4h12M5.333 4V2.667a1.333 1.333 0 011.334-1.334h2.666a1.333 1.333 0 011.334 1.334V4m2 0v9.333a1.333 1.333 0 01-1.334 1.334H4.667a1.333 1.333 0 01-1.334-1.334V4h9.334z"/></svg>
                  <span v-else class="text-xs">…</span>
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

        <!-- Build/version footer -->
        <div class="border-t border-ctp-surface0 pt-4">
          <BuildInfo />
        </div>
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
          <!-- New address handling (formerly "Default filter mode") -->
          <div class="flex items-center justify-between gap-4 p-4">
            <div>
              <p class="text-sm font-medium text-ctp-text">New address handling</p>
              <p class="mt-0.5 text-xs text-ctp-subtext0">What happens when an email arrives for an address not yet in your alias list</p>
            </div>
            <button
              type="button"
              class="rounded-lg border border-ctp-surface1 bg-ctp-mantle px-3 py-1.5 text-xs text-ctp-text transition-colors hover:border-ctp-mauve"
              @click="defaultPolicyModalOpen = true"
            >
              {{ FILTER_MODES.find((m) => m.value === (accountStore.account?.filtering.defaultUnknownSenderPolicy ?? 'quarantine_visible'))?.label }}
            </button>
          </div>
        </div>
        <!-- Divider between account defaults and alias list -->
        <div class="my-6 border-t border-ctp-surface0" />

        <!-- Search + Add button -->
        <div class="mb-4 flex items-center gap-2">
          <input
            v-model="aliasSearch"
            type="text"
            aria-label="Search aliases"
            placeholder="Search aliases…"
            class="flex-1 rounded-lg border border-ctp-surface1 bg-ctp-mantle px-3 py-2 text-sm text-ctp-text placeholder:text-ctp-subtext0 focus:border-ctp-mauve focus:outline-none"
          />
          <button
            type="button"
            class="shrink-0 rounded-lg bg-ctp-mauve px-4 py-2 text-sm font-medium text-ctp-base hover:opacity-90"
            @click="addAliasModalOpen = true"
          >
            + Add alias
          </button>
        </div>

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
          <div v-for="alias in filteredAliases" :key="alias.address" class="px-4 py-2.5" :class="expandedAlias === alias.address ? 'bg-ctp-surface0/30 border-l-2 border-l-ctp-mauve' : ''">
            <!-- Compact single-line row -->
            <div
              role="button"
              tabindex="0"
              class="flex items-center justify-between gap-2 cursor-pointer"
              :aria-expanded="expandedAlias === alias.address"
              :aria-label="`Toggle details for ${alias.address}`"
              @click="toggleAliasExpand(alias.address)"
              @keydown.enter="toggleAliasExpand(alias.address)"
              @keydown.space.prevent="toggleAliasExpand(alias.address)"
            >
              <p class="min-w-0 flex-1 truncate text-sm font-medium text-ctp-text">{{ alias.address }}</p>
              <button
                type="button"
                class="shrink-0 rounded-full border border-ctp-surface1 px-2.5 py-0.5 text-xs text-ctp-subtext1 transition-colors hover:border-ctp-mauve hover:text-ctp-mauve"
                @click.stop="filterModalAlias = alias; filterModalOpen = true"
              >
                {{ FILTER_MODES.find((m) => m.value === alias.unknownSenderPolicy)?.label ?? alias.unknownSenderPolicy }}
              </button>
              <svg class="h-4 w-4 shrink-0 text-ctp-subtext0 transition-transform" :class="expandedAlias === alias.address ? 'rotate-180' : ''" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clip-rule="evenodd" />
              </svg>
            </div>
            <!-- Expandable details -->
            <div v-if="expandedAlias === alias.address" class="mt-2 space-y-3 border-t border-ctp-surface0 pt-3">
              <!-- Senders list -->
              <div>
                <span class="mb-1.5 block text-xs text-ctp-subtext0">Known senders</span>
                <div v-if="aliasSendersLoading.has(alias.address)" class="animate-pulse space-y-1.5">
                  <div v-for="i in 2" :key="i" class="flex items-center gap-2">
                    <div class="h-3.5 flex-1 rounded bg-ctp-surface1" :style="{ maxWidth: `${80 + i * 30}px` }" />
                    <div class="h-5 w-14 rounded-full bg-ctp-surface1" />
                  </div>
                </div>
                <div v-else-if="!aliasSenders.get(alias.address)?.length" class="text-xs text-ctp-subtext0">
                  No senders recorded yet — senders appear here as emails arrive
                </div>
                <div v-else class="space-y-1">
                  <div
                    v-for="sender in aliasSenders.get(alias.address)"
                    :key="sender.sender"
                    class="flex items-center justify-between gap-2 rounded px-2 py-1 hover:bg-ctp-surface0/50"
                  >
                    <span class="min-w-0 flex-1 truncate text-xs text-ctp-text">{{ sender.sender }}</span>
                    <button
                      type="button"
                      class="shrink-0 rounded-full border border-ctp-surface1 px-2 py-0.5 text-xs text-ctp-subtext1 transition-colors hover:border-ctp-mauve hover:text-ctp-mauve"
                      :aria-label="`Policy for ${sender.sender}`"
                      @click="senderPolicyModal = { open: true, aliasAddress: alias.address, senderDomain: sender.sender, currentPolicy: sender.policy }"
                    >
                      {{ SENDER_POLICIES.find((p) => p.value === sender.policy)?.label ?? sender.policy }}
                    </button>
                    <button
                      type="button"
                      class="text-ctp-subtext0 hover:text-ctp-red"
                      title="Remove sender"
                      @click="removeSender(alias.address, sender.sender)"
                    >
                      <svg class="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8" /></svg>
                    </button>
                  </div>
                </div>
              </div>
              <button
                class="text-ctp-subtext0 hover:text-ctp-red"
                title="Remove alias"
                @click="deleteAddress(alias.address)"
              >
                <svg class="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4h12M5.333 4V2.667a1.333 1.333 0 011.334-1.334h2.666a1.333 1.333 0 011.334 1.334V4m2 0v9.333a1.333 1.333 0 01-1.334 1.334H4.667a1.333 1.333 0 01-1.334-1.334V4h9.334z"/></svg>
              </button>
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
              <div class="relative">
                <button
                  type="button"
                  class="rounded-lg border border-ctp-surface1 px-2 py-1.5 text-xs text-ctp-subtext0 transition-colors hover:border-ctp-surface2 hover:text-ctp-text"
                  :aria-label="`Actions for ${domain.domain}`"
                  @click="domainMenuOpen = domainMenuOpen === domain.domainId ? null : domain.domainId"
                >
                  <svg class="h-4 w-4" viewBox="0 0 16 16" fill="currentColor">
                    <circle cx="8" cy="3" r="1.5" /><circle cx="8" cy="8" r="1.5" /><circle cx="8" cy="13" r="1.5" />
                  </svg>
                </button>
                <template v-if="domainMenuOpen === domain.domainId">
                  <div role="presentation" class="fixed inset-0 z-40" @click="domainMenuOpen = null" />
                  <div class="absolute right-0 top-full z-50 mt-1 w-36 rounded-lg border border-ctp-surface1 bg-ctp-mantle py-1 shadow-lg">
                    <button
                      type="button"
                      class="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-ctp-red hover:bg-ctp-red/10"
                      @click="domainMenuOpen = null; deleteDomain(domain.domainId)"
                    >
                      Delete domain
                    </button>
                  </div>
                </template>
              </div>
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
        <!-- Verification feedback -->
        <div v-if="verifySuccess" class="mb-4 rounded-lg border border-ctp-green bg-ctp-green/10 px-4 py-3 text-sm text-ctp-green">
          {{ verifySuccess }}
        </div>
        <div v-if="verifyError" class="mb-4 rounded-lg border border-ctp-red bg-ctp-red/10 px-4 py-3 text-sm text-ctp-red">
          {{ verifyError }}
        </div>

        <!-- Calendar forwarding target -->
        <div class="mb-6 rounded-lg border border-ctp-surface1 p-4">
          <label for="calendar-forwarding" class="mb-1 block text-xs font-medium text-ctp-subtext0">Calendar invite forwarding</label>
          <p class="mb-2 text-xs text-ctp-subtext0">Calendar invites will be automatically forwarded to this target</p>
          <div class="flex gap-2">
            <select
              id="calendar-forwarding"
              v-model="calendarForwardingTargetId"
              class="flex-1 appearance-none rounded-lg border border-ctp-surface1 bg-ctp-mantle px-3 py-2 text-sm text-ctp-text focus:border-ctp-mauve focus:outline-none"
              @change="saveCalendarForwarding()"
            >
              <option value="">None</option>
              <option
                v-for="t in verifiedForwardingTargets"
                :key="t.target"
                :value="t.target"
              >
                {{ t.target }}
              </option>
            </select>
          </div>
        </div>

        <!-- Add forwarding target button -->
        <div class="mb-4">
          <button
            type="button"
            class="rounded-lg bg-ctp-mauve px-4 py-2 text-sm font-medium text-ctp-base hover:opacity-90"
            @click="addTargetDialogOpen = true"
          >
            Add Forwarding Target
          </button>
        </div>

        <!-- Add target inline dialog -->
        <div v-if="addTargetDialogOpen" class="mb-4 rounded-lg border border-ctp-surface1 bg-ctp-mantle p-4">
          <div class="mb-3 flex items-center justify-between">
            <span class="text-sm font-medium text-ctp-text">New forwarding target</span>
            <button
              type="button"
              class="text-xs text-ctp-subtext0 hover:text-ctp-text"
              @click="addTargetDialogOpen = false; addTargetType = null; newForwardTarget = ''"
            >
              Cancel
            </button>
          </div>

          <!-- Type selection -->
          <div v-if="!addTargetType" class="flex gap-2">
            <button
              type="button"
              class="flex-1 rounded-lg border border-ctp-surface1 px-4 py-3 text-sm text-ctp-text transition-colors hover:border-ctp-mauve hover:text-ctp-mauve"
              @click="addTargetType = 'email'"
            >
              <svg class="mx-auto mb-1 h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z"/><path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z"/></svg>
              Email
            </button>
            <button
              type="button"
              class="flex-1 rounded-lg border border-ctp-surface1 px-4 py-3 text-sm text-ctp-text transition-colors hover:border-ctp-mauve hover:text-ctp-mauve"
              @click="addTargetType = 'webhook'"
            >
              <svg class="mx-auto mb-1 h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M12.586 4.586a2 2 0 112.828 2.828l-3 3a2 2 0 01-2.828 0 1 1 0 00-1.414 1.414 4 4 0 005.656 0l3-3a4 4 0 00-5.656-5.656l-1.5 1.5a1 1 0 101.414 1.414l1.5-1.5zm-5 5a2 2 0 012.828 0 1 1 0 101.414-1.414 4 4 0 00-5.656 0l-3 3a4 4 0 105.656 5.656l1.5-1.5a1 1 0 10-1.414-1.414l-1.5 1.5a2 2 0 11-2.828-2.828l3-3z" clip-rule="evenodd"/></svg>
              Webhook
            </button>
          </div>

          <!-- Input form -->
          <form v-else class="flex gap-2" @submit.prevent="addForwardingTarget">
            <input
              v-model="newForwardTarget"
              :type="addTargetType === 'email' ? 'email' : 'url'"
              :aria-label="addTargetType === 'email' ? 'Email address' : 'Webhook URL'"
              :placeholder="addTargetType === 'email' ? 'forward@example.com' : 'https://hooks.example.com/...'"
              class="flex-1 rounded-lg border border-ctp-surface1 bg-ctp-base px-3 py-2 text-sm text-ctp-text placeholder:text-ctp-overlay0 focus:border-ctp-mauve focus:outline-none"
              autofocus
            />
            <AsyncButton
              type="submit"
              :action="addForwardingTarget"
              :disabled="!newForwardTarget.trim()"
              class="rounded-lg bg-ctp-mauve px-4 py-2 text-sm font-medium text-ctp-base hover:opacity-90"
            >
              Add
            </AsyncButton>
            <button
              type="button"
              class="rounded-lg border border-ctp-surface1 px-3 py-2 text-xs text-ctp-subtext0 hover:text-ctp-text"
              @click="addTargetType = null; newForwardTarget = ''"
            >
              Back
            </button>
          </form>
        </div>

        <div
          v-if="forwardingLoading"
          role="status"
          aria-label="Loading forwarding targets…"
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
          <p class="font-medium text-ctp-text">No forwarding targets yet</p>
          <p class="mx-auto mt-1 max-w-sm">
            Forwarding lets you send matched emails to another inbox or webhook automatically. Add a
            target here, then wire it up in a rule — useful for team handoffs, archiving, or
            integrations.
          </p>
        </div>
        <div v-else class="divide-y divide-ctp-surface0 rounded-lg border border-ctp-surface0">
          <div
            v-for="fwd in forwarding"
            :key="fwd.target"
            class="flex items-center justify-between px-4 py-3"
          >
            <div class="flex items-center gap-2.5">
              <!-- Type icon -->
              <svg v-if="fwd.type === 'email'" class="h-4 w-4 shrink-0 text-ctp-subtext0" viewBox="0 0 20 20" fill="currentColor">
                <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z"/>
                <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z"/>
              </svg>
              <svg v-else class="h-4 w-4 shrink-0 text-ctp-subtext0" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M12.586 4.586a2 2 0 112.828 2.828l-3 3a2 2 0 01-2.828 0 1 1 0 00-1.414 1.414 4 4 0 005.656 0l3-3a4 4 0 00-5.656-5.656l-1.5 1.5a1 1 0 101.414 1.414l1.5-1.5zm-5 5a2 2 0 012.828 0 1 1 0 101.414-1.414 4 4 0 00-5.656 0l-3 3a4 4 0 105.656 5.656l1.5-1.5a1 1 0 10-1.414-1.414l-1.5 1.5a2 2 0 11-2.828-2.828l3-3z" clip-rule="evenodd"/>
              </svg>
              <div>
                <p class="text-sm text-ctp-text">{{ fwd.target }}</p>
                <p v-if="fwd.verifiedAt" class="text-xs text-ctp-green">
                  Verified on {{ new Date(fwd.verifiedAt).toLocaleDateString(undefined, { dateStyle: 'medium' }) }}
                </p>
                <p v-else-if="fwd.status === 'disabled'" class="text-xs text-ctp-subtext0">Disabled</p>
                <p v-else class="text-xs text-ctp-yellow">Pending verification</p>
              </div>
            </div>
            <button
              class="text-ctp-subtext0 hover:text-ctp-red"
              title="Remove"
              @click="removeForwarding(fwd.target)"
            >
              <svg class="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4h12M5.333 4V2.667a1.333 1.333 0 011.334-1.334h2.666a1.333 1.333 0 011.334 1.334V4m2 0v9.333a1.333 1.333 0 01-1.334 1.334H4.667a1.333 1.333 0 01-1.334-1.334V4h9.334z"/></svg>
            </button>
          </div>
        </div>
      </section>

      <!-- ── Email tab ──────────────────────────────────────────────── -->
      <section v-else-if="activeTab === 'email'" class="space-y-6">
        <!-- After send navigation -->
        <div>
          <span class="mb-1 block text-xs font-medium text-ctp-subtext0">After send</span>
          <p class="mb-2 text-xs text-ctp-subtext0">Where to navigate after sending a reply</p>
          <div class="flex gap-2">
            <AsyncButton
              v-for="option in [{ value: 'return_to_inbox' as const, label: 'Return to inbox' }, { value: 'stay_on_thread' as const, label: 'Stay on thread' }]"
              :key="option.value"
              :action="() => userConfigStore.update({ postSendView: option.value })"
              variant="ghost"
              :aria-pressed="userConfigStore.postSendView === option.value"
              class="flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs"
              :class="
                userConfigStore.postSendView === option.value
                  ? 'border-ctp-mauve bg-ctp-mauve/10 text-ctp-mauve'
                  : 'border-ctp-surface1 text-ctp-subtext0 hover:border-ctp-surface2 hover:text-ctp-text'
              "
            >
              {{ option.label }}
            </AsyncButton>
          </div>
        </div>

        <!-- Data retention -->
        <div class="border-t border-ctp-surface0 pt-5">
          <span class="mb-1 block text-xs font-medium text-ctp-subtext0">Data retention</span>
          <p class="mb-3 text-xs text-ctp-subtext0">How long conversations are kept</p>

          <div class="relative">
            <select
              :value="selectedRetention"
              :disabled="retentionPending"
              aria-label="Retention duration"
              class="w-full appearance-none rounded-lg border border-ctp-surface1 bg-ctp-mantle px-3 py-2 pr-8 text-sm text-ctp-text focus:border-ctp-mauve focus:outline-none disabled:opacity-50"
              @change="updateRetention(($event.target as HTMLSelectElement).value as RetentionDuration)"
            >
              <option v-if="!selectedRetention" value="" disabled selected>Select duration…</option>
              <option
                v-for="opt in retentionOptions"
                :key="opt.value"
                :value="opt.value"
                :disabled="!opt.available"
              >
                {{ opt.label }}{{ !opt.available ? ` 🔒 ${opt.badge}` : '' }}
              </option>
            </select>
            <svg class="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ctp-subtext0" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clip-rule="evenodd" />
            </svg>
          </div>

          <!-- Upgrade prompt -->
          <div
            v-if="retentionUpgradePrompt"
            class="mt-2 rounded border border-ctp-yellow/40 bg-ctp-yellow/10 px-3 py-2 text-xs text-ctp-yellow"
          >
            This retention duration requires a higher plan.
            <router-link to="/billing" class="font-medium underline hover:text-ctp-text">Upgrade</router-link>
          </div>

          <p class="mt-3 text-xs text-ctp-subtext0">
            Applies to all conversations that receive new messages. Existing inactive threads keep their current retention.
          </p>
        </div>

        <!-- Browser notifications test -->
        <div class="border-t border-ctp-surface0 pt-5">
          <span class="mb-1 block text-xs font-medium text-ctp-subtext0">Browser notifications</span>
          <p class="mb-2 text-xs text-ctp-subtext0">Test that OS notifications are working</p>
          <div class="mt-3">
            <button
              class="rounded-lg border border-ctp-surface1 px-3 py-1.5 text-xs text-ctp-subtext1 transition-colors hover:border-ctp-surface2 hover:text-ctp-text"
              @click="sendTestNotification"
            >
              Send test notification
            </button>
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
              class="text-ctp-subtext0 hover:text-ctp-red"
              title="Remove"
              @click="removeMember(member.userId, member.name ?? member.email ?? member.userId)"
            >
              <svg class="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4h12M5.333 4V2.667a1.333 1.333 0 011.334-1.334h2.666a1.333 1.333 0 011.334 1.334V4m2 0v9.333a1.333 1.333 0 01-1.334 1.334H4.667a1.333 1.333 0 01-1.334-1.334V4h9.334z"/></svg>
            </button>
          </div>
        </div>
      </section>

      <section v-else-if="activeTab === 'billing'">
        <BillingPanel />
      </section>

    </main>

    <!-- Bottom tab bar (mobile) -->
    <SettingsTabBar
      class="shrink-0 sm:hidden"
      :tabs="TABS"
      :active="activeTab"
      @select="(key) => switchTab(key as TabKey)"
    />

    <ConfirmDialog
      :open="dialogOpen"
      :title="dialogOptions.title"
      :message="dialogOptions.message"
      :confirm-label="dialogOptions.confirmLabel"
      :confirm-variant="dialogOptions.confirmVariant"
      :require-input="dialogOptions.requireInput"
      :require-input-label="dialogOptions.requireInputLabel"
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
      title="New address handling"
      subtitle="What happens when an email arrives for an address not yet in your alias list."
      :current-mode="accountStore.account?.filtering.defaultUnknownSenderPolicy ?? 'quarantine_visible'"
      :modes="FILTER_MODES"
      @select="(mode) => updateDefaultPolicy(mode as UnknownSenderPolicy)"
      @close="defaultPolicyModalOpen = false"
    />

    <FilterModeModal
      :open="senderPolicyModal.open"
      :title="`Policy for ${senderPolicyModal.senderDomain}`"
      subtitle="Choose how emails from this sender are handled."
      :current-mode="senderPolicyModal.currentPolicy"
      :modes="SENDER_POLICIES"
      @select="(mode) => { updateSenderPolicy(senderPolicyModal.aliasAddress, senderPolicyModal.senderDomain, mode as SenderPolicy); senderPolicyModal = { ...senderPolicyModal, open: false } }"
      @close="senderPolicyModal = { ...senderPolicyModal, open: false }"
    />

    <!-- Add alias modal -->
    <Teleport to="body">
      <div
        v-if="addAliasModalOpen"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
        aria-hidden="true"
        @click.self="addAliasModalOpen = false"
      >
        <div role="dialog" aria-modal="true" aria-label="Add alias" class="w-full max-w-sm rounded-xl border border-ctp-surface1 bg-ctp-base p-6 shadow-xl">
          <h2 class="mb-4 text-sm font-semibold text-ctp-text">Add alias</h2>
          <form @submit.prevent="addAddress">
            <input
              v-model="newAddress"
              type="email"
              aria-label="New email address"
              placeholder="you@domain.com"
              class="mb-4 w-full rounded-lg border border-ctp-surface1 bg-ctp-mantle px-3 py-2 text-sm text-ctp-text placeholder:text-ctp-subtext0 focus:border-ctp-mauve focus:outline-none"
              autofocus
            />
            <div class="flex justify-end gap-2">
              <button
                type="button"
                class="rounded-lg border border-ctp-surface1 px-4 py-2 text-sm text-ctp-subtext1 hover:border-ctp-surface2 hover:text-ctp-text"
                @click="addAliasModalOpen = false"
              >
                Cancel
              </button>
              <AsyncButton
                type="submit"
                :action="addAddress"
                :disabled="!newAddress.trim()"
                class="rounded-lg bg-ctp-mauve px-4 py-2 text-sm font-medium text-ctp-base hover:opacity-90"
              >
                Add
              </AsyncButton>
            </div>
          </form>
        </div>
      </div>
    </Teleport>
  </div>
</template>

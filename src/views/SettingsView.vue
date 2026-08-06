<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAccountStore } from '@/stores/account'
import { useUserConfigStore } from '@/stores/userConfig'
import { api } from '@/lib/api'
import { notify } from '@/lib/notifications'
import { loginClient, logout } from '@/lib/auth'
import logger from '@/lib/logger'
import { UserConfigurationScreen } from '@authress/login'
import type { DeviceType, Device, LinkedIdentity } from '@authress/login'
import { useFeatureTour } from '@/composables/useFeatureTour'
import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts'
import AsyncButton from '@/components/ui/AsyncButton.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import NoticeDialog from '@/components/ui/NoticeDialog.vue'
import FilterModeModal from '@/components/ui/FilterModeModal.vue'
import OverflowMenu from '@/components/ui/OverflowMenu.vue'
import SettingsTabBar from '@/components/settings/SettingsTabBar.vue'
import BillingPanel from '@/components/settings/BillingPanel.vue'
import AddForwardingTargetModal from '@/components/settings/AddForwardingTargetModal.vue'
import DnsSetupDialog from '@/components/settings/DnsSetupDialog.vue'
import BuildInfo from '@/components/BuildInfo.vue'
import UserAvatarIcon from '@/components/UserAvatarIcon.vue'
import ConnectionIcon from '@/components/ConnectionIcon.vue'
import { connectionLabel } from '@/lib/connections'
import { mailboxConnectionId, mailboxConnectionProperties } from '@/lib/mailbox-scopes'
import { useGestureHandler } from '@/composables/useGestureHandler'
import { useConfirmDialog } from '@/composables/useConfirmDialog'
import { useToast } from '@/composables/useToast'
import { useIdentity } from '@/composables/useIdentity'
import { useIsMobile } from '@/composables/useIsMobile'
import { SETTINGS_TABS, resolveSettingsTab, type SettingsTabKey } from '@/lib/settingsTabs'
import type {
  Domain,
  DnsRecord,
  Alias,
  AliasSender,
  SenderPolicy,
  ForwardingTarget,
  ExternalMailExchange,
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
const { deferAction, notify: showToast } = useToast()
const isMobile = useIsMobile()

type TabKey = SettingsTabKey
const activeTab = ref<TabKey>('email-forwarding')

// ─── Profile tab ─────────────────────────────────────────────────────────────
const identity = useIdentity()

// ─── Profile sub-tabs (Configuration / Security) ─────────────────────────────
type ProfileSubTab = 'configuration' | 'security'
const profileSubTab = ref<ProfileSubTab>('configuration')

// ─── Email & Forwarding sub-tabs ──────────────────────────────────────────────
type EmailSubTab = 'email' | 'inbound' | 'forwarding' | 'domains'
const emailSubTab = ref<EmailSubTab>('email')

function setEmailSubTab(sub: EmailSubTab) {
  emailSubTab.value = sub
  void router.replace(`/settings/email-forwarding${sub !== 'email' ? `?tab=${sub}` : ''}`)
}

const { startTour } = useFeatureTour()
// Shared with AppLayout's global "?" binding — one ShortcutHelpOverlay
// instance for the whole app, mounted in AppLayout; this just opens it.
const { shortcutHelpOpen } = useKeyboardShortcuts()

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
  } catch (e) {
    securityDeviceError.value = 'Failed to load security devices'
    logger.warn({ title: 'Failed to load security devices', error: e })
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
      .catch((e: unknown) => {
        securityProfileError.value = 'Failed to load identity connections'
        logger.warn({ title: 'Failed to load identity connections', error: e })
      })
      .finally(() => {
        securityProfileLoading.value = false
      }),
    loadSecurityDevices(),
  ])
}

async function disconnectIdentity(ident: LinkedIdentity) {
  if (!canDisconnect.value) return
  const confirmed = await confirmAction({
    title: 'Disconnect identity',
    message: `Disconnect ${connectionLabel(ident.connection.connectionId)}? You must keep at least one connection.`,
    confirmLabel: 'Disconnect',
    confirmVariant: 'danger',
  })
  if (!confirmed) return
  disconnectPending.value = ident.connection.userId
  securityProfileError.value = null
  try {
    await loginClient.unlinkIdentity(ident.connection.userId)
    securityProfile.value = await loginClient.getUserProfile()
  } catch (e) {
    securityProfileError.value = 'Failed to disconnect identity'
    logger.warn({ title: 'Failed to disconnect identity', error: e })
  } finally {
    disconnectPending.value = null
  }
}

async function linkIdentity() {
  // Start the Authress "link a new connection" flow. With no connectionId the
  // user picks their provider on the Authress hosted screen. This is a
  // full-page redirect back to redirectUrl; on return the component remounts
  // and loadSecurityProfile() refreshes the linked-identity list.
  await loginClient.linkIdentity({ redirectUrl: window.location.href })
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
  } catch (e) {
    securityDeviceError.value = 'Failed to remove device'
    logger.warn({ title: 'Failed to remove device', error: e })
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
  } catch (e) {
    securityDeviceError.value = 'Passkey registration failed — check your browser supports WebAuthn'
    logger.warn({ title: 'Passkey registration failed', error: e })
  } finally {
    passkeyPending.value = false
  }
}

// ─── Account profile tab ─────────────────────────────────────────────────────
const calendarForwardingTargetId = ref('')
const calendarForwardingPending = ref(false)
const calendarForwardingSaved = ref(false)

// While true, the <select> displays the "＋ Add new…" sentinel instead of
// calendarForwardingTargetId (the persisted value) — set while the add-target
// modal is open from this select, cleared on cancel or once the modal resolves.
const calendarShowingSentinel = ref(false)
const calendarSelectValue = computed({
  get: () => (calendarShowingSentinel.value ? ADD_NEW_SENTINEL : calendarForwardingTargetId.value),
  set: (val: string) => {
    if (val === ADD_NEW_SENTINEL) {
      calendarShowingSentinel.value = true
      openAddTargetModal('calendar')
    } else {
      calendarShowingSentinel.value = false
      calendarForwardingTargetId.value = val
      void saveCalendarForwarding()
    }
  },
})

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

const PLAN_RANK: Record<string, number> = { free: 0, pro: 1, premium: 2, team: 3, company: 4, enterprise: 5 }

const currentPlanRank = computed(() => {
  const plan = accountStore.account?.billingPlan ?? 'free'
  return PLAN_RANK[plan] ?? 0
})

const retentionOptions = computed(() =>
  RETENTION_OPTIONS.map((opt) => ({
    ...opt,
    available: currentPlanRank.value >= (PLAN_RANK[opt.minPlan] ?? 0),
  })),
)

const selectedRetention = ref<RetentionDuration | undefined>(undefined)
const retentionPending = ref(false)
const retentionUpgradePrompt = ref(false)
const retentionUpgradePlan = ref('')

async function updateRetention(value: RetentionDuration) {
  const opt = retentionOptions.value.find((o) => o.value === value)
  if (!opt?.available) {
    retentionUpgradePlan.value = opt?.minPlan ?? 'pro'
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
  return aliases.value.filter((a) => a.alias.toLowerCase().includes(q))
})

const filterModalOpen = ref(false)
const filterModalAlias = ref<Alias | null>(null)
const defaultPolicyModalOpen = ref(false)

const FILTER_MODES: { value: UnknownSenderPolicy; label: string; description: string }[] = [
  { value: 'allow_all', label: 'Allow all', description: 'All senders pass through' },
  { value: 'quarantine_visible', label: 'Quarantine and notify', description: 'Unknown senders held for review, you get notified' },
  { value: 'quarantine_hidden', label: 'Quarantine', description: 'Unknown senders silently held for review' },
  { value: 'block_hidden', label: 'Drop', description: 'Unknown senders silently discarded' },
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
    aliases.value = aliases.value.map((a) => (a.alias === address ? result.value : a))
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
  if (result.isOk()) aliases.value = aliases.value.filter((a) => a.alias !== address)
}

// ─── Domains tab ──────────────────────────────────────────────────────────────
const domains = ref<(Domain & { records?: DnsRecord[] })[]>([])
const domainsLoading = ref(false)
const newDomain = ref('')
const addDomainPending = ref(false)
const recheckPending = ref<Set<string>>(new Set())
const dnsSetupDomain = ref<(Domain & { records?: DnsRecord[] }) | null>(null)
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
  if (result.isErr()) return
  const added = result.value
  domains.value = [...domains.value, added]
  newDomain.value = ''
  // Fetch DNS records and open setup dialog
  const detail = await api.recheckDomain(accountStore.accountId, added.domainId)
  if (detail.isOk()) {
    const updated = detail.value
    domains.value = domains.value.map((d) => (d.domainId === added.domainId ? updated : d))
    dnsSetupDomain.value = updated
  } else {
    dnsSetupDomain.value = added
  }
}

async function openDnsSetup(domain: Domain & { records?: DnsRecord[] }) {
  if (!accountStore.accountId) return
  if (!domain.records?.length) {
    const result = await api.recheckDomain(accountStore.accountId, domain.domainId)
    if (result.isOk()) {
      domains.value = domains.value.map((d) => (d.domainId === domain.domainId ? result.value : d))
      dnsSetupDomain.value = result.value
      return
    }
  }
  dnsSetupDomain.value = domain
}

async function recheckDomain(domainId: string) {
  if (!accountStore.accountId || recheckPending.value.has(domainId)) return
  recheckPending.value = new Set([...recheckPending.value, domainId])
  const result = await api.recheckDomain(accountStore.accountId, domainId)
  recheckPending.value = new Set([...recheckPending.value].filter((id) => id !== domainId))
  if (result.isOk()) {
    domains.value = domains.value.map((d) => (d.domainId === domainId ? result.value : d))
    if (dnsSetupDomain.value?.domainId === domainId) {
      dnsSetupDomain.value = result.value
    }
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

// ─── Forwarding addresses tab ─────────────────────────────────────────────────
const forwarding = ref<ForwardingTarget[]>([])
const forwardingLoading = ref(false)
const verifySuccess = ref('')
const verifyError = ref('')

// Shared "add forwarding target" popup — opened from the tab's own button and
// from the "＋ Add new…" option in the calendar/digest selects (see
// calendarSelectValue / digestSelectValue above). `addTargetOrigin` tracks
// which of those triggered it, so a successful add knows whether (and which)
// select to update afterward.
const ADD_NEW_SENTINEL = '__add_new_forwarding_target__'
type AddTargetOrigin = 'button' | 'calendar' | 'digest'
const addTargetOrigin = ref<AddTargetOrigin>('button')
const showAddTargetModal = ref(false)

async function openAddTargetModal(origin: AddTargetOrigin) {
  addTargetOrigin.value = origin
  // The calendar/digest selects live on different tabs (Email & Forwarding,
  // Profile) — jump to the one with the target list so the newly created row
  // (and, for a pending email target, where to come back and select it) is
  // visible once the modal closes. No-op if already there.
  if (origin !== 'button') {
    await switchTab('email-forwarding')
    setEmailSubTab('forwarding')
  }
  showAddTargetModal.value = true
}

function closeAddTargetModal() {
  showAddTargetModal.value = false
  calendarShowingSentinel.value = false
  digestShowingSentinel.value = false
}

async function handleAddForwardingTarget(payload: { type: 'email' | 'webhook'; target: string }) {
  if (!accountStore.accountId) return
  const result = await api.createForwardingAddress(accountStore.accountId, payload)
  if (result.isErr()) {
    throw new Error(result.error.message)
  }
  forwarding.value = [...forwarding.value, result.value]
  showAddTargetModal.value = false

  const origin = addTargetOrigin.value
  if (origin === 'calendar' || origin === 'digest') {
    const showingSentinel = origin === 'calendar' ? calendarShowingSentinel : digestShowingSentinel
    showingSentinel.value = false
    if (result.value.status === 'verified') {
      // Webhook targets verify immediately — safe to select right away.
      if (origin === 'calendar') {
        calendarForwardingTargetId.value = result.value.target
        void saveCalendarForwarding()
      } else {
        digestForwardingTargetId.value = result.value.target
        void saveDigest()
      }
    } else {
      // Email targets stay "pending" until the user clicks the verification
      // link — nothing to select yet.
      showToast(`${result.value.target} needs to be verified — check your inbox, then select it here.`, 5000)
    }
  }
}

async function loadForwarding() {
  if (!accountStore.accountId) return
  forwardingLoading.value = true
  const result = await api.listForwardingAddresses(accountStore.accountId)
  forwardingLoading.value = false
  if (result.isOk()) forwarding.value = result.value
}

async function removeForwarding(target: string) {
  if (!accountStore.accountId) return
  const result = await api.deleteForwardingAddress(accountStore.accountId, target)
  if (result.isOk()) forwarding.value = forwarding.value.filter((f) => f.target !== target)
}

const verifiedForwardingTargets = computed(() => forwarding.value.filter((f) => f.status === 'verified'))

// ─── External Mail Exchanges ──────────────────────────────────────────────────
const exchanges = ref<ExternalMailExchange[]>([])
const exchangesLoading = ref(false)
const emxError = ref('')
const emxPlatformPickerOpen = ref(false)
const emxConnecting = ref(false)
const emxActivationError = ref('')
const emxDeletePending = ref<string | null>(null)

async function loadExchanges() {
  if (!accountStore.accountId) return
  exchangesLoading.value = true
  const result = await api.listExternalExchanges(accountStore.accountId)
  exchangesLoading.value = false
  if (result.isOk()) exchanges.value = result.value
  else emxError.value = result.error.message
}

async function connectExchange(platform: 'gmail' | 'outlook') {
  if (!accountStore.accountId) return
  emxActivationError.value = ''
  emxPlatformPickerOpen.value = false

  // Redirect to provider OAuth — page unloads. On return, onMounted picks up completeExchange param.
  const connectionId = mailboxConnectionId(platform)
  const basePath = import.meta.env.VITE_BASE_PATH ?? '/'
  const redirectUrl = `${window.location.origin}${basePath}settings/email-forwarding?tab=inbound&completeExchange=${platform}`

  // linkIdentity, not authenticate: connecting a mailbox attaches a provider identity to the
  // signed-in user. authenticate() logs them *in as* that identity instead, which for a user
  // who signed up with one provider and connects a mailbox on another either switches their
  // session identity or forks a second account.
  //
  // connectionProperties carry the mail scopes — Authress requests provider scopes at link
  // time, so a mailbox linked without them can be read but never sent from.
  await loginClient.linkIdentity({
    connectionId,
    connectionProperties: mailboxConnectionProperties(platform),
    redirectUrl,
  })
  // If linkIdentity doesn't redirect (identity already linked with these scopes), complete inline
  await completeExchangeActivation(platform)
}

async function completeExchangeActivation(platform: 'gmail' | 'outlook') {
  if (!accountStore.accountId) return
  emxConnecting.value = true
  emxActivationError.value = ''

  // Report which identity was just linked. The connection id is ours to know — it is the one
  // the link flow used — and the provider-side user id identifies which of the user's linked
  // identities backs this mailbox; the server persists both so no later code has to guess a
  // connection from the platform. The lookup is best-effort: without it the mailbox still
  // connects, it just carries no provider-side id.
  const connectionId = mailboxConnectionId(platform)
  let connectionUserId: string | undefined
  try {
    const profile = await loginClient.getUserProfile()
    connectionUserId = profile?.linkedIdentities?.find(
      (i) => i.connection.connectionId === connectionId,
    )?.connection.userId
  } catch (e) {
    logger.warn({ title: 'Could not read back the linked identity for the connected mailbox', error: e })
  }

  // The mailbox address is deliberately not sent: the only mailbox identifier available here
  // is that same provider-side user id, which for Google is a numeric subject and not an
  // email address at all. The backend asks the provider directly using the access token it
  // already holds, which is the only authoritative source.
  const createResult = await api.createExternalExchange(accountStore.accountId, {
    platform,
    connectionId,
    ...(connectionUserId ? { connectionUserId } : {}),
  })
  emxConnecting.value = false
  if (createResult.isErr()) {
    emxActivationError.value = createResult.error.message
    return
  }
  // Upsert: replace if existing (idempotent re-POST), append if new
  const existingEmx = exchanges.value.find((e) => e.exchangeId === createResult.value.exchangeId)
  if (existingEmx) {
    exchanges.value = exchanges.value.map((e) => e.exchangeId === createResult.value.exchangeId ? createResult.value : e)
  } else {
    exchanges.value = [...exchanges.value, createResult.value]
  }
}

async function retryExchange(emx: ExternalMailExchange) {
  if (!accountStore.accountId) return
  if (emx.platform === 'imap') {
    openImapForm(emx)
    return
  }
  if (emx.platform === 'jmap') {
    openJmapForm(emx)
    return
  }
  // OAuth (gmail/outlook) — re-run the connect flow without deleting.
  // The backend POST is idempotent on platform + emailAddress.
  await connectExchange(emx.platform as 'gmail' | 'outlook')
}

async function deleteExchange(emx: ExternalMailExchange) {
  if (!accountStore.accountId) return
  const confirmed = await confirmAction({
    title: 'Disconnect mail exchange',
    message: `Disconnect ${emx.emailAddress || emx.platform}? New emails from this provider will no longer sync.`,
    confirmLabel: 'Disconnect',
    confirmVariant: 'danger',
  })
  if (!confirmed) return
  emxDeletePending.value = emx.exchangeId
  const result = await api.deleteExternalExchange(accountStore.accountId, emx.exchangeId)
  emxDeletePending.value = null
  if (result.isOk()) {
    exchanges.value = exchanges.value.filter((e) => e.exchangeId !== emx.exchangeId)
    emxDetailExchange.value = null
  }
}

function openExchangeDetail(emx: ExternalMailExchange) {
  if (emx.platform === 'imap') openImapForm(emx)
  else if (emx.platform === 'jmap') openJmapForm(emx)
  else emxDetailExchange.value = emx
}

const emxDetailExchange = ref<ExternalMailExchange | null>(null)

// ─── IMAP/JMAP connection form ────────────────────────────────────────────────
type EmxDialogView = 'picker' | 'imap-form' | 'jmap-form'
const emxDialogView = ref<EmxDialogView>('picker')
const imapFormHost = ref('')
const imapFormUsername = ref('')
const imapFormPassword = ref('')
const imapFormTls = ref<'TLS' | 'DISABLED'>('TLS')
const imapFormSaving = ref(false)
const imapFormError = ref('')
const imapEditingEmx = ref<ExternalMailExchange | null>(null)

const PASSWORD_MASK = '••••••••••••••••'
function isPasswordChanged(value: string): boolean { return !!value && !value.includes('•') }

function openImapForm(emx?: ExternalMailExchange) {
  if (emx?.imapConfig) {
    imapEditingEmx.value = emx
    imapFormHost.value = emx.imapConfig.host
    imapFormUsername.value = emx.imapConfig.username
    imapFormPassword.value = PASSWORD_MASK
    imapFormTls.value = emx.imapConfig.tlsConfig
  } else {
    imapEditingEmx.value = null
    imapFormHost.value = ''
    imapFormUsername.value = ''
    imapFormPassword.value = ''
    imapFormTls.value = 'TLS'
  }
  imapFormError.value = ''
  emxDialogView.value = 'imap-form'
  emxPlatformPickerOpen.value = true
}

function closeEmxDialog() {
  emxPlatformPickerOpen.value = false
  setTimeout(() => { emxDialogView.value = 'picker' }, 200)
}

async function submitImapForm() {
  if (!accountStore.accountId) return
  imapFormSaving.value = true
  imapFormError.value = ''

  if (imapEditingEmx.value) {
    const body: { imapConfig: { host?: string; tlsConfig?: 'TLS' | 'DISABLED'; username?: string; password?: string } } = { imapConfig: {} }
    if (imapFormHost.value !== imapEditingEmx.value.imapConfig?.host) body.imapConfig.host = imapFormHost.value
    if (imapFormTls.value !== imapEditingEmx.value.imapConfig?.tlsConfig) body.imapConfig.tlsConfig = imapFormTls.value
    if (imapFormUsername.value !== imapEditingEmx.value.imapConfig?.username) body.imapConfig.username = imapFormUsername.value
    if (isPasswordChanged(imapFormPassword.value)) body.imapConfig.password = imapFormPassword.value

    const result = await api.patchExternalExchange(accountStore.accountId, imapEditingEmx.value.exchangeId, body)
    imapFormSaving.value = false
    if (result.isErr()) {
      imapFormError.value = result.error.message
      return
    }
    exchanges.value = exchanges.value.map((e) => e.exchangeId === result.value.exchangeId ? result.value : e)
  } else {
    const result = await api.createExternalExchange(accountStore.accountId, {
      platform: 'imap',
      imapConfig: { host: imapFormHost.value, tlsConfig: imapFormTls.value, username: imapFormUsername.value, password: imapFormPassword.value },
    })
    imapFormSaving.value = false
    if (result.isErr()) {
      imapFormError.value = result.error.message
      return
    }
    exchanges.value = [...exchanges.value, result.value]
  }
  closeEmxDialog()
}

// ─── JMAP connection form ─────────────────────────────────────────────────────
type JmapStep = 'email' | 'credentials'
const jmapStep = ref<JmapStep>('email')
const jmapEmail = ref('')
const jmapSessionUrl = ref('')
const jmapSessionDiscovered = ref(false)
const jmapUsername = ref('')
const jmapPassword = ref('')
const jmapDiscovering = ref(false)
const jmapFormSaving = ref(false)
const jmapFormError = ref('')
const jmapEditingEmx = ref<ExternalMailExchange | null>(null)

function openJmapForm(emx?: ExternalMailExchange) {
  if (emx?.jmapConfig) {
    jmapEditingEmx.value = emx
    jmapSessionUrl.value = emx.jmapConfig.sessionUrl
    jmapSessionDiscovered.value = false
    jmapUsername.value = emx.jmapConfig.username
    jmapPassword.value = PASSWORD_MASK
    jmapEmail.value = emx.emailAddress || emx.jmapConfig.username
    jmapStep.value = 'credentials'
  } else {
    jmapEditingEmx.value = null
    jmapEmail.value = ''
    jmapSessionUrl.value = ''
    jmapSessionDiscovered.value = false
    jmapUsername.value = ''
    jmapPassword.value = ''
    jmapStep.value = 'email'
  }
  jmapFormError.value = ''
  emxDialogView.value = 'jmap-form'
  emxPlatformPickerOpen.value = true
}

async function jmapDiscover() {
  jmapFormError.value = ''
  const emailVal = jmapEmail.value.trim()
  const atIdx = emailVal.indexOf('@')
  if (atIdx < 1) {
    jmapFormError.value = 'Enter a valid email address'
    return
  }
  const domain = emailVal.slice(atIdx + 1)
  jmapDiscovering.value = true

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10_000)
    const resp = await fetch(`https://${domain}/.well-known/jmap`, { signal: controller.signal })
    clearTimeout(timeout)
    if (resp.ok) {
      const json = await resp.json()
      if (json && typeof json.apiUrl === 'string') {
        jmapSessionUrl.value = resp.url || `https://${domain}/.well-known/jmap`
        jmapSessionDiscovered.value = true
        jmapUsername.value = emailVal
        jmapStep.value = 'credentials'
        jmapDiscovering.value = false
        return
      }
    }
  } catch {
    // CORS, network error, timeout — all fall through to manual entry
  }

  jmapDiscovering.value = false
  jmapSessionDiscovered.value = false
  jmapUsername.value = emailVal
  jmapStep.value = 'credentials'
}

async function submitJmapForm() {
  if (!accountStore.accountId) return
  jmapFormSaving.value = true
  jmapFormError.value = ''

  if (jmapEditingEmx.value) {
    const body: { jmapConfig: { sessionUrl?: string; username?: string; password?: string } } = { jmapConfig: {} }
    if (jmapSessionUrl.value !== jmapEditingEmx.value.jmapConfig?.sessionUrl) body.jmapConfig.sessionUrl = jmapSessionUrl.value
    if (jmapUsername.value !== jmapEditingEmx.value.jmapConfig?.username) body.jmapConfig.username = jmapUsername.value
    if (isPasswordChanged(jmapPassword.value)) body.jmapConfig.password = jmapPassword.value

    const result = await api.patchExternalExchange(accountStore.accountId, jmapEditingEmx.value.exchangeId, body)
    jmapFormSaving.value = false
    if (result.isErr()) {
      jmapFormError.value = result.error.message
      jmapPassword.value = ''
      return
    }
    exchanges.value = exchanges.value.map((e) => e.exchangeId === result.value.exchangeId ? result.value : e)
  } else {
    const result = await api.createExternalExchange(accountStore.accountId, {
      platform: 'jmap',
      jmapConfig: { sessionUrl: jmapSessionUrl.value, username: jmapUsername.value, password: jmapPassword.value },
    })
    jmapFormSaving.value = false
    if (result.isErr()) {
      jmapFormError.value = result.error.message
      jmapPassword.value = ''
      return
    }
    exchanges.value = [...exchanges.value, result.value]
  }
  closeEmxDialog()
}

async function resendForwardingVerification(target: ForwardingTarget) {
  if (!accountStore.accountId) return
  // Delete and re-create to resend verification email
  await api.deleteForwardingAddress(accountStore.accountId, target.target)
  const result = await api.createForwardingAddress(accountStore.accountId, { target: target.target, type: target.type })
  if (result.isOk()) {
    forwarding.value = forwarding.value.map((f) => (f.target === target.target ? result.value : f))
    showToast('Verification email resent', 3000)
  }
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

// ─── User ID copy ─────────────────────────────────────────────────────────────
const userIdCopied = ref(false)

function copyUserId() {
  if (!identity.userId) return
  void navigator.clipboard.writeText(identity.userId).then(() => {
    userIdCopied.value = true
    setTimeout(() => { userIdCopied.value = false }, 1500)
  })
}

const signingOut = ref(false)

async function signOut() {
  signingOut.value = true
  // Land on the public site root (the marketing/landing page), not the app's
  // deploy base path — a signed-out user has nothing to see inside the app.
  await logout(`${window.location.origin}/`)
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

// See calendarShowingSentinel above — same pattern, this tab's own select.
const digestShowingSentinel = ref(false)
const digestSelectValue = computed({
  get: () => (digestShowingSentinel.value ? ADD_NEW_SENTINEL : digestForwardingTargetId.value),
  set: (val: string) => {
    if (val === ADD_NEW_SENTINEL) {
      digestShowingSentinel.value = true
      openAddTargetModal('digest')
    } else {
      digestShowingSentinel.value = false
      digestForwardingTargetId.value = val
      void saveDigest()
    }
  },
})

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

function showTestNotification() {
  // Deep-links back to this exact section (PWA-first: clicking it focuses the
  // installed app instead of opening a browser tab — see src/sw.ts) and
  // demonstrates action buttons, both explicitly requested test cases.
  void notify({
    title: 'Test notification from SES Adapter',
    body: 'If you see this, notifications are working.',
    url: '/settings?tab=email-forwarding',
    actions: [
      { action: 'open-settings', title: 'Open Settings', url: '/settings?tab=email-forwarding' },
      { action: 'dismiss', title: 'Dismiss' },
    ],
  })
}

function sendTestNotification() {
  if (!('Notification' in window)) return
  if (Notification.permission === 'granted') {
    showTestNotification()
    return
  }
  void Notification.requestPermission().then((permission) => {
    if (permission === 'granted') showTestNotification()
  })
}

// ─── Tab loading ──────────────────────────────────────────────────────────────
async function switchTab(tab: TabKey) {
  activeTab.value = tab
  void router.replace(`/settings/${tab}`)
  if (tab === 'emails' && aliases.value.length === 0) await loadAliases()
  if (tab === 'email-forwarding') {
    if (domains.value.length === 0) await loadDomains()
    if (forwarding.value.length === 0) await loadForwarding()
    if (exchanges.value.length === 0) await loadExchanges()
  }
  if (tab === 'profile') {
    if (!securityProfile.value) await loadSecurityProfile()
    if (forwarding.value.length === 0) await loadForwarding()
  }
  if (tab === 'team' && team.value.length === 0) await loadTeam()
}

onMounted(async () => {
  identity.load()
  if (accountStore.account) {
    calendarForwardingTargetId.value = accountStore.account.defaultCalendarInviteForwardingTargetId ?? ''
    selectedRetention.value = accountStore.account.retentionDuration
    digestFrequency.value = accountStore.account.digest?.frequency ?? null
    digestForwardingTargetId.value = accountStore.account.digest?.forwardingTargetId ?? ''
  }
  // Handle forwarding address verification from email link
  const verifyAddress = route.query.verifyAddress as string | undefined
  const token = route.query.token as string | undefined
  if (verifyAddress && token && accountStore.accountId) {
    await loadForwarding()
    const result = await api.verifyForwardingAddress(accountStore.accountId, verifyAddress, token)
    if (result.isOk()) {
      verifySuccess.value = `${verifyAddress} verified successfully`
      await loadForwarding()
    } else {
      verifyError.value = result.error.message || 'Verification failed'
    }
    const { verifyAddress: _va, token: _tk, ...rest } = route.query
    void router.replace({ query: rest })
    activeTab.value = 'email-forwarding'
    setEmailSubTab('forwarding')
  }
  // Handle OAuth exchange completion redirect
  const completeExchange = route.query.completeExchange as string | undefined
  if (completeExchange && (completeExchange === 'gmail' || completeExchange === 'outlook') && accountStore.accountId) {
    const { completeExchange: _ce, ...rest } = route.query
    void router.replace({ query: rest })
    await completeExchangeActivation(completeExchange)
  }
  // Hydrate active tab from route param (path segment)
  const tabParam = route.params.tab as string | undefined
  const tab = resolveSettingsTab(tabParam)
  if (tab) {
    // Capture sub-tab from query BEFORE switchTab fires router.replace (which strips query)
    const subTab = route.query.tab as string | undefined
    await switchTab(tab)
    // Restore the sub-tab using setEmailSubTab (which re-pushes the query to the URL)
    if (subTab === 'forwarding') setEmailSubTab('forwarding')
    else if (subTab === 'domains') setEmailSubTab('domains')
    else if (subTab === 'inbound') setEmailSubTab('inbound')
    else if (subTab === 'email') setEmailSubTab('email')
    else if (subTab === 'configuration') profileSubTab.value = 'configuration'
    else if (subTab === 'security') profileSubTab.value = 'security'
    // For profile sub-tabs, push the query back to the URL
    if (subTab === 'security' || subTab === 'configuration') {
      void router.replace(`/settings/profile?tab=${subTab}`)
    }
  } else if (tabParam) {
    // Unknown tab segment — redirect to first tab
    void router.replace('/settings/email-forwarding')
  }
})

const TABS = SETTINGS_TABS

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

    <!-- Mobile top bar (back button + "{Tab}" title) now lives in the global
         AppNavbar (see AppLayout.vue) instead of a second bar here. -->

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
            <UserAvatarIcon :picture="identity.picture" :initials="identity.initials" :display-name="identity.displayName" text-size="text-lg" />
          </span>
          <div class="min-w-0 flex-1">
            <p v-if="identity.displayName" class="truncate text-sm font-semibold text-ctp-text">{{ identity.displayName }}</p>
            <p v-if="identity.email && identity.email !== identity.displayName" class="truncate text-xs text-ctp-subtext0">{{ identity.email }}</p>
            <div v-if="identity.userId" class="mt-1 flex items-center gap-1.5">
              <p class="truncate font-mono text-xs text-ctp-subtext0">{{ identity.userId }}</p>
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

          <!-- Keyboard shortcuts — hidden on mobile (no physical keyboard;
               the global ?-shortcut itself is also disabled below the sm
               breakpoint, see useKeyboardShortcuts.ts). -->
          <section v-if="!isMobile" class="rounded-lg border border-ctp-surface1 p-4">
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
                  v-model="digestSelectValue"
                  class="w-full appearance-none rounded-lg border border-ctp-surface1 bg-ctp-base px-3 py-2 text-sm text-ctp-text focus:border-ctp-mauve focus:outline-none"
                >
                  <option value="">Select target…</option>
                  <option
                    v-for="t in verifiedForwardingTargets"
                    :key="t.target"
                    :value="t.target"
                  >
                    {{ t.target }}
                  </option>
                  <option :value="ADD_NEW_SENTINEL">＋ Add new…</option>
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
                    class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ctp-surface1"
                  >
                    <ConnectionIcon :connection-id="ident.connection.connectionId" />
                  </span>
                  <div>
                    <p class="text-sm font-medium text-ctp-text">
                      {{ connectionLabel(ident.connection.connectionId) }}
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

          <!-- Multi-factor authentication -->
          <section class="rounded-lg border border-ctp-surface1 p-4">
            <h2 class="mb-1 text-sm font-medium text-ctp-text">Multi-factor authentication</h2>
            <p class="mb-4 text-xs text-ctp-subtext0">
              Add a second factor to protect your account even if your password is compromised.
            </p>

            <!-- Registered devices -->
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
              <p class="text-sm text-ctp-subtext1">No MFA devices registered</p>
              <p class="mt-1 text-xs text-ctp-subtext0">
                Add one of the methods below to secure your account.
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

            <!-- Add a method -->
            <div class="mt-4 space-y-3 border-t border-ctp-surface0 pt-4">
              <!-- Passkey (inline WebAuthn registration) -->
              <div class="rounded-lg border border-ctp-surface0 p-3">
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <p class="text-sm font-medium text-ctp-text">Passkey</p>
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
                  class="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-ctp-surface1 bg-ctp-base p-3"
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
              </div>

              <!-- Physical security key -->
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
          <div v-for="alias in filteredAliases" :key="alias.alias" class="px-4 py-2.5" :class="expandedAlias === alias.alias ? 'bg-ctp-surface0/30 border-l-2 border-l-ctp-mauve' : ''">
            <!-- Compact single-line row -->
            <div
              role="button"
              tabindex="0"
              class="flex items-center justify-between gap-2 cursor-pointer"
              :aria-expanded="expandedAlias === alias.alias"
              :aria-label="`Toggle details for ${alias.alias}`"
              @click="toggleAliasExpand(alias.alias)"
              @keydown.enter="toggleAliasExpand(alias.alias)"
              @keydown.space.prevent="toggleAliasExpand(alias.alias)"
            >
              <p class="min-w-0 flex-1 truncate text-sm font-medium text-ctp-text">{{ alias.alias }}</p>
              <button
                type="button"
                class="shrink-0 rounded-full border border-ctp-surface1 px-2.5 py-0.5 text-xs text-ctp-subtext1 transition-colors hover:border-ctp-mauve hover:text-ctp-mauve"
                @click.stop="filterModalAlias = alias; filterModalOpen = true"
              >
                {{ FILTER_MODES.find((m) => m.value === alias.unknownSenderPolicy)?.label ?? alias.unknownSenderPolicy }}
              </button>
              <svg class="h-4 w-4 shrink-0 text-ctp-subtext0 transition-transform" :class="expandedAlias === alias.alias ? 'rotate-180' : ''" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clip-rule="evenodd" />
              </svg>
            </div>
            <!-- Expandable details -->
            <div v-if="expandedAlias === alias.alias" class="mt-2 space-y-3 border-t border-ctp-surface0 pt-3">
              <!-- Senders list -->
              <div>
                <span class="mb-1.5 block text-xs text-ctp-subtext0">Known senders</span>
                <div v-if="aliasSendersLoading.has(alias.alias)" class="animate-pulse space-y-1.5">
                  <div v-for="i in 2" :key="i" class="flex items-center gap-2">
                    <div class="h-3.5 flex-1 rounded bg-ctp-surface1" :style="{ maxWidth: `${80 + i * 30}px` }" />
                    <div class="h-5 w-14 rounded-full bg-ctp-surface1" />
                  </div>
                </div>
                <div v-else-if="!aliasSenders.get(alias.alias)?.length" class="text-xs text-ctp-subtext0">
                  No senders recorded yet — senders appear here as emails arrive
                </div>
                <div v-else class="space-y-1">
                  <div
                    v-for="sender in aliasSenders.get(alias.alias)"
                    :key="sender.sender"
                    class="flex items-center justify-between gap-2 rounded px-2 py-1 hover:bg-ctp-surface0/50"
                  >
                    <span class="min-w-0 flex-1 truncate text-xs text-ctp-text">{{ sender.sender }}</span>
                    <button
                      type="button"
                      class="shrink-0 rounded-full border border-ctp-surface1 px-2 py-0.5 text-xs text-ctp-subtext1 transition-colors hover:border-ctp-mauve hover:text-ctp-mauve"
                      :aria-label="`Policy for ${sender.sender}`"
                      @click="senderPolicyModal = { open: true, aliasAddress: alias.alias, senderDomain: sender.sender, currentPolicy: sender.policy }"
                    >
                      {{ SENDER_POLICIES.find((p) => p.value === sender.policy)?.label ?? sender.policy }}
                    </button>
                    <button
                      type="button"
                      class="text-ctp-subtext0 hover:text-ctp-red"
                      title="Remove sender"
                      @click="removeSender(alias.alias, sender.sender)"
                    >
                      <svg class="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8" /></svg>
                    </button>
                  </div>
                </div>
              </div>
              <button
                class="text-ctp-subtext0 hover:text-ctp-red"
                title="Remove alias"
                @click="deleteAddress(alias.alias)"
              >
                <svg class="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4h12M5.333 4V2.667a1.333 1.333 0 011.334-1.334h2.666a1.333 1.333 0 011.334 1.334V4m2 0v9.333a1.333 1.333 0 01-1.334 1.334H4.667a1.333 1.333 0 01-1.334-1.334V4h9.334z"/></svg>
              </button>
            </div>
          </div>
        </div>
      </section>

      <!-- ── Email & Forwarding tab ─────────────────────────────────────── -->
      <section v-else-if="activeTab === 'email-forwarding'" class="space-y-6">
        <!-- Email & Forwarding sub-tabs -->
        <nav class="flex gap-2" aria-label="Email & Forwarding sub-tabs">
          <button
            type="button"
            class="rounded-full px-4 py-1.5 text-sm font-medium transition-colors"
            :class="emailSubTab === 'email' ? 'bg-ctp-mauve/15 text-ctp-mauve' : 'text-ctp-subtext0 hover:bg-ctp-surface0 hover:text-ctp-text'"
            @click="setEmailSubTab('email')"
          >
            Email
          </button>
          <button
            type="button"
            class="rounded-full px-4 py-1.5 text-sm font-medium transition-colors"
            :class="emailSubTab === 'inbound' ? 'bg-ctp-mauve/15 text-ctp-mauve' : 'text-ctp-subtext0 hover:bg-ctp-surface0 hover:text-ctp-text'"
            @click="setEmailSubTab('inbound')"
          >
            Syncing
          </button>
          <button
            type="button"
            class="rounded-full px-4 py-1.5 text-sm font-medium transition-colors"
            :class="emailSubTab === 'forwarding' ? 'bg-ctp-mauve/15 text-ctp-mauve' : 'text-ctp-subtext0 hover:bg-ctp-surface0 hover:text-ctp-text'"
            @click="setEmailSubTab('forwarding')"
          >
            Forwarding
          </button>
          <button
            type="button"
            class="rounded-full px-4 py-1.5 text-sm font-medium transition-colors"
            :class="emailSubTab === 'domains' ? 'bg-ctp-mauve/15 text-ctp-mauve' : 'text-ctp-subtext0 hover:bg-ctp-surface0 hover:text-ctp-text'"
            @click="setEmailSubTab('domains')"
          >
            DNS Domains
          </button>
        </nav>

        <!-- Email sub-tab -->
        <template v-if="emailSubTab === 'email'">
          <section class="rounded-lg border border-ctp-surface1 p-4">
            <div class="space-y-6">
              <h2 class="text-sm font-semibold text-ctp-text">Email</h2>

              <!-- After send navigation -->
              <div>
                <span class="mb-1 block text-xs font-medium text-ctp-subtext0">After send</span>
                <p class="mb-2 text-xs text-ctp-subtext0">Where to navigate after sending a reply</p>
                <div class="flex gap-2">
                  <AsyncButton
                    v-for="option in [{ value: 'return_to_inbox' as const, label: 'Return to inbox' }, { value: 'stay_on_thread' as const, label: 'Stay on thread' }]"
                    :key="option.value"
                    :action="() => userConfigStore.update({ postSendView: option.value })"
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
                    >
                      {{ opt.label }}{{ !opt.available ? ` 🔒 ${opt.minPlan.charAt(0).toUpperCase() + opt.minPlan.slice(1)}` : '' }}
                    </option>
                  </select>
                  <svg class="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ctp-subtext0" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clip-rule="evenodd" />
                  </svg>
                </div>

                <!-- Upgrade prompt dialog -->
                <NoticeDialog
                  :open="retentionUpgradePrompt"
                  title="Plan upgrade needed"
                  :message="`This retention duration requires the ${retentionUpgradePlan.charAt(0).toUpperCase() + retentionUpgradePlan.slice(1)} plan. You can upgrade from the Billing page.`"
                  dismiss-label="Got it"
                  tone="warning"
                  @close="retentionUpgradePrompt = false"
                />

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
            </div>
          </section>
        </template>

        <!-- Inbound sub-tab -->
        <template v-if="emailSubTab === 'inbound'">
          <section class="space-y-4 rounded-lg border border-ctp-surface1 p-4">
          <div class="flex items-center justify-between">
            <h2 class="text-sm font-semibold text-ctp-text">Inbound Receiving</h2>
            <button
              type="button"
              class="rounded-lg bg-ctp-mauve px-3 py-1.5 text-xs font-medium text-ctp-base hover:opacity-90"
              @click="emxPlatformPickerOpen = true"
            >
              + Connect
            </button>
          </div>

          <p class="text-xs text-ctp-subtext0">
            Pull email into your account from external providers. Connect via OAuth (Gmail, Outlook) for automatic sync, or use IMAP/JMAP credentials for any standard mail server — Fastmail, ProtonMail Bridge, self-hosted, etc. Or directly send email to your inbox using the Forward Address below:
          </p>

          <!-- Inbound address display -->
          <div class="rounded-lg border border-ctp-surface1 p-4">
            <span class="mb-1 block text-xs font-medium text-ctp-subtext0">Forward email to</span>
            <p v-if="domains.length > 0" class="font-mono text-sm text-ctp-text">
              inbound@{{ domains[0].domain }}
            </p>
            <p v-else class="text-sm text-ctp-subtext0 italic">
              Add a domain to receive email
            </p>
          </div>

          <!-- EMX error -->
          <div v-if="emxError" class="rounded border border-ctp-red bg-ctp-red/10 px-3 py-2 text-xs text-ctp-red">
            {{ emxError }}
          </div>

          <!-- Activation error with retry -->
          <div v-if="emxActivationError" class="rounded border border-ctp-red bg-ctp-red/10 px-3 py-2 text-xs text-ctp-red">
            <span>{{ emxActivationError }}</span>
          </div>

          <!-- EMX list -->
          <div
            v-if="exchangesLoading"
            role="status"
            aria-label="Loading exchanges…"
            class="animate-pulse divide-y divide-ctp-surface0 rounded-lg border border-ctp-surface0"
          >
            <div v-for="i in 2" :key="i" class="flex items-center gap-3 px-4 py-3">
              <div class="h-6 w-6 shrink-0 rounded bg-ctp-surface1" />
              <div class="h-4 flex-1 rounded bg-ctp-surface1" :style="{ maxWidth: `${130 + i * 40}px` }" />
              <div class="h-5 w-14 shrink-0 rounded-full bg-ctp-surface1" />
            </div>
          </div>
          <div
            v-else-if="exchanges.length === 0"
            class="rounded-lg border border-dashed border-ctp-surface1 px-6 py-8 text-center text-sm text-ctp-subtext0"
          >
            <p class="font-medium text-ctp-text">No connected exchanges</p>
            <p class="mx-auto mt-1 max-w-sm">
              Connect Gmail, Outlook, or any IMAP/JMAP server to sync inbound email from existing accounts.
            </p>
          </div>
          <div v-else class="divide-y divide-ctp-surface0 rounded-lg border border-ctp-surface0">
            <div
              v-for="emx in exchanges"
              :key="emx.exchangeId"
              role="button"
              tabindex="0"
              class="flex cursor-pointer items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-ctp-surface0/50"
              @click="openExchangeDetail(emx)"
              @keydown.enter="openExchangeDetail(emx)"
            >
              <div class="flex items-center gap-2.5">
                <!-- Platform icon -->
                <span v-if="emx.platform === 'gmail'" class="flex h-6 w-6 shrink-0 items-center justify-center">
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="#EA4335"><path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z"/></svg>
                </span>
                <span v-else-if="emx.platform === 'outlook'" class="flex h-6 w-6 shrink-0 items-center justify-center">
                  <svg viewBox="0 0 512 512" width="20" height="20"><rect width="231" height="270" x="168" y="107" fill="#05a" rx="3%"/><path fill="#136" d="M398 247v23l15-8s0-7-5-9l-10-6zm-230 43v70h77v-70h-77z"/><path fill="#17d" d="M168 150v70h77v-70h-77zm77 70v70h77v-70h-77zm77 70v70h77v-70h-77z"/><path fill="#3ae" d="M245 150v70h77v-70h-77zm77 70v70h77v-70h-77z"/><path fill="#5cf" d="M322 150h77v70h-77z"/><path fill="#19e" d="M413 261 282 336s121 73 124 71c5-3 7-11 7-18V261Z"/><path fill="#2ae" d="M160 266c-4 3-6 7-6 12v117c0 8 6 14 14 14h230c4 0 5 0 8-2"/><rect width="172" height="172" x="70" y="172" fill="#18e" rx="3%"/><path fill="#fff" d="M155 230c14 0 22 11 22 29s-9 28-23 28c-11 0-22-10-22-28 0-15 7-29 23-29Zm-1 75c26 0 44-18 44-47 0-25-16-46-43-46-28 0-44 20-44 48 0 27 20 45 43 45Z"/></svg>
                </span>
                <span v-else-if="emx.platform === 'imap'" class="flex h-6 shrink-0 items-center justify-center rounded bg-ctp-teal/10 px-1.5 text-[10px] font-bold tracking-wide text-ctp-teal">IMAP</span>
                <span v-else-if="emx.platform === 'jmap'" class="flex h-6 shrink-0 items-center justify-center rounded bg-ctp-sapphire/10 px-1.5 text-[10px] font-bold tracking-wide text-ctp-sapphire">JMAP</span>
                <span v-else class="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-ctp-surface1 text-xs font-bold text-ctp-subtext0">✉</span>
                <div>
                  <p class="text-sm text-ctp-text">{{ emx.emailAddress || emx.platform }}</p>
                  <p v-if="emx.status === 'activation_failed' && emx.errorReason" class="text-xs text-ctp-red">
                    {{ emx.errorReason }}
                  </p>
                  <p v-else class="text-xs text-ctp-subtext0">
                    <span v-if="emx.syncCursor">{{ emx.syncCursor }}</span>
                    <span v-if="emx.syncCursor && emx.lastSyncAt"> · </span>
                    <span v-if="emx.lastSyncAt">synced {{ new Date(emx.lastSyncAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) }}</span>
                  </p>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <!-- Status badge -->
                <span
                  class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
                  :class="{
                    'bg-ctp-green/10 text-ctp-green': emx.status === 'active',
                    'bg-ctp-red/10 text-ctp-red': emx.status === 'activation_failed',
                  }"
                >
                  <span
                    class="inline-block h-1.5 w-1.5 rounded-full"
                    :class="{
                      'bg-ctp-green': emx.status === 'active',
                      'bg-ctp-red': emx.status === 'activation_failed',
                    }"
                  />
                  {{ emx.status === 'active' ? 'Active' : 'Failed' }}
                </span>
                <!-- Chevron to indicate clickable -->
                <svg class="h-4 w-4 text-ctp-subtext0" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3l5 5-5 5"/></svg>
              </div>
            </div>
          </div>

          </section>
        </template>

        <!-- Forwarding sub-tab -->
        <template v-if="emailSubTab === 'forwarding'">
          <section class="rounded-lg border border-ctp-surface1 p-4">
            <div class="space-y-4">
          <h2 class="text-sm font-semibold text-ctp-text">Outbound Forwarding</h2>
          <!-- Verification feedback -->
          <div v-if="verifySuccess" class="rounded-lg border border-ctp-green bg-ctp-green/10 px-4 py-3 text-sm text-ctp-green">
            {{ verifySuccess }}
          </div>
          <div v-if="verifyError" class="rounded-lg border border-ctp-red bg-ctp-red/10 px-4 py-3 text-sm text-ctp-red">
            {{ verifyError }}
          </div>

          <!-- Calendar forwarding target -->
          <div class="rounded-lg border border-ctp-surface1 p-4">
            <label for="calendar-forwarding" class="mb-1 block text-xs font-medium text-ctp-subtext0">Calendar invite forwarding</label>
            <p class="mb-2 text-xs text-ctp-subtext0">Calendar invites will be automatically forwarded to this target</p>
            <div class="flex gap-2">
              <select
                id="calendar-forwarding"
                v-model="calendarSelectValue"
                class="flex-1 appearance-none rounded-lg border border-ctp-surface1 bg-ctp-mantle px-3 py-2 text-sm text-ctp-text focus:border-ctp-mauve focus:outline-none"
              >
                <option value="">None</option>
                <option
                  v-for="t in verifiedForwardingTargets"
                  :key="t.target"
                  :value="t.target"
                >
                  {{ t.target }}
                </option>
                <option :value="ADD_NEW_SENTINEL">＋ Add new…</option>
              </select>
            </div>
          </div>

          <!-- Add forwarding target button -->
          <div>
            <button
              type="button"
              class="rounded-lg bg-ctp-mauve px-4 py-2 text-sm font-medium text-ctp-base hover:opacity-90"
              @click="openAddTargetModal('button')"
            >
              Add Forwarding Target
            </button>
          </div>

          <!-- Forwarding targets list -->
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
                  <div v-else class="flex items-center gap-2">
                    <p class="text-xs text-ctp-yellow">Pending verification</p>
                    <button
                      type="button"
                      class="text-xs text-ctp-mauve hover:text-ctp-mauve/80"
                      @click.stop="resendForwardingVerification(fwd)"
                    >
                      Resend
                    </button>
                  </div>
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
            </div>
          </section>
        </template>

        <!-- Domains sub-tab -->
        <template v-if="emailSubTab === 'domains'">
          <section class="rounded-lg border border-ctp-surface1 p-4">
            <div class="space-y-4">
          <h2 class="text-sm font-semibold text-ctp-text">Domains</h2>

          <form class="flex gap-2" @submit.prevent="addDomain">
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
                <div class="flex items-center gap-2">
                  <button
                    type="button"
                    class="rounded-lg border border-ctp-surface1 px-3 py-1.5 text-xs text-ctp-subtext1 transition-colors hover:border-ctp-surface2 hover:text-ctp-text"
                    @click="openDnsSetup(domain)"
                  >
                    DNS Setup
                  </button>
                  <AsyncButton
                    v-if="!domain.receivingSetupComplete || !domain.senderSetupComplete"
                    :action="() => recheckDomain(domain.domainId)"
                    class="px-3 py-1.5 text-xs text-ctp-subtext1 hover:border-ctp-surface2 hover:text-ctp-text"
                  >
                    Re-check DNS
                  </AsyncButton>
                  <OverflowMenu
                    :label="`Actions for ${domain.domain}`"
                    :sheet-title="domain.domain"
                    menu-width-class="w-36"
                    trigger-class="rounded-lg border border-ctp-surface1 px-2 py-1.5 text-xs text-ctp-subtext0 transition-colors hover:border-ctp-surface2 hover:text-ctp-text"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      class="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-ctp-red hover:bg-ctp-red/10"
                      @click="deleteDomain(domain.domainId)"
                    >
                      Delete domain
                    </button>
                  </OverflowMenu>
                </div>
              </div>
            </div>
          </div>
            </div>
          </section>
        </template>
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
      :title="`Filter mode for ${filterModalAlias?.alias ?? ''}`"
      :current-mode="filterModalAlias?.unknownSenderPolicy ?? 'quarantine_visible'"
      :modes="FILTER_MODES"
      @select="(mode) => { if (filterModalAlias) { updateAliasMode(filterModalAlias.alias, mode as UnknownSenderPolicy); filterModalAlias = { ...filterModalAlias, unknownSenderPolicy: mode as UnknownSenderPolicy } } }"
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

    <AddForwardingTargetModal
      :open="showAddTargetModal"
      :submit="handleAddForwardingTarget"
      @update:open="(open) => open ? (showAddTargetModal = true) : closeAddTargetModal()"
    />

    <DnsSetupDialog
      :open="dnsSetupDomain !== null"
      :domain="dnsSetupDomain"
      :recheck-pending="dnsSetupDomain ? recheckPending.has(dnsSetupDomain.domainId) : false"
      @recheck="dnsSetupDomain && recheckDomain(dnsSetupDomain.domainId)"
      @close="dnsSetupDomain = null"
    />

    <!-- OAuth exchange detail dialog (Gmail/Outlook) -->
    <Teleport to="body">
      <div
        v-if="emxDetailExchange"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
        aria-hidden="true"
        @click.self="emxDetailExchange = null"
      >
        <div role="dialog" aria-modal="true" aria-label="Exchange details" class="w-full max-w-sm overflow-hidden rounded-xl border border-ctp-surface1 bg-ctp-base shadow-xl">
          <div class="border-b border-ctp-surface0 px-5 py-4">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2.5">
                <span v-if="emxDetailExchange.platform === 'gmail'" class="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-ctp-red/10 text-sm font-bold text-ctp-red">G</span>
                <span v-else class="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-ctp-blue/10 text-sm font-bold text-ctp-blue">O</span>
                <div>
                  <p class="text-sm font-medium text-ctp-text">{{ emxDetailExchange.emailAddress || emxDetailExchange.platform }}</p>
                  <p class="text-xs text-ctp-subtext0 capitalize">{{ emxDetailExchange.platform }}</p>
                </div>
              </div>
              <button type="button" class="text-ctp-subtext0 hover:text-ctp-text" @click="emxDetailExchange = null">
                <svg class="h-5 w-5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>
              </button>
            </div>
          </div>
          <div class="space-y-4 px-5 py-4">
            <!-- Status -->
            <div class="flex items-center justify-between">
              <span class="text-xs text-ctp-subtext0">Status</span>
              <span
                class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
                :class="{
                  'bg-ctp-green/10 text-ctp-green': emxDetailExchange.status === 'active',
                  'bg-ctp-red/10 text-ctp-red': emxDetailExchange.status === 'activation_failed',
                }"
              >
                <span class="inline-block h-1.5 w-1.5 rounded-full" :class="{ 'bg-ctp-green': emxDetailExchange.status === 'active', 'bg-ctp-red': emxDetailExchange.status === 'activation_failed' }" />
                {{ emxDetailExchange.status === 'active' ? 'Active' : 'Failed' }}
              </span>
            </div>
            <!-- Error reason -->
            <div v-if="emxDetailExchange.status === 'activation_failed' && emxDetailExchange.errorReason" class="rounded border border-ctp-red/30 bg-ctp-red/5 px-3 py-2 text-xs text-ctp-red">
              {{ emxDetailExchange.errorReason }}
            </div>
            <!-- Last sync -->
            <div v-if="emxDetailExchange.lastSyncAt" class="flex items-center justify-between">
              <span class="text-xs text-ctp-subtext0">Last sync</span>
              <span class="text-xs text-ctp-text">{{ new Date(emxDetailExchange.lastSyncAt).toLocaleDateString(undefined, { dateStyle: 'medium' }) }}</span>
            </div>
            <!-- Retry button for failed -->
            <button
              v-if="emxDetailExchange.status === 'activation_failed'"
              type="button"
              class="w-full rounded-lg border border-ctp-mauve bg-ctp-mauve/10 px-3 py-2 text-sm font-medium text-ctp-mauve hover:bg-ctp-mauve/20"
              :disabled="emxConnecting"
              @click="retryExchange(emxDetailExchange); emxDetailExchange = null"
            >
              Reconnect
            </button>
            <!-- Disconnect -->
            <button
              type="button"
              class="w-full rounded-lg border border-ctp-red/30 px-3 py-2 text-sm text-ctp-red hover:bg-ctp-red/10"
              :disabled="emxDeletePending === emxDetailExchange.exchangeId"
              @click="deleteExchange(emxDetailExchange)"
            >
              Disconnect
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- EMX platform picker modal -->
    <Teleport to="body">
      <div
        v-if="emxPlatformPickerOpen"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
        aria-hidden="true"
        @click.self="closeEmxDialog"
      >
        <div role="dialog" aria-modal="true" aria-label="Connect email provider" class="w-full max-w-sm overflow-hidden rounded-xl border border-ctp-surface1 bg-ctp-base shadow-xl">
          <!-- Picker view -->
          <Transition name="fade" mode="out-in">
            <div v-if="emxDialogView === 'picker'" key="picker" class="p-6">
              <h2 class="mb-2 text-sm font-semibold text-ctp-text">Connect email provider</h2>
              <p class="mb-4 text-xs text-ctp-subtext0">Choose a provider to sync inbound email from.</p>
              <div class="space-y-2">
                <button
                  type="button"
                  class="flex w-full items-center gap-3 rounded-lg border border-ctp-surface1 p-3 text-left transition-colors hover:border-ctp-mauve hover:bg-ctp-mauve/5"
                  :disabled="emxConnecting"
                  @click="connectExchange('gmail')"
                >
                  <span class="flex h-8 w-8 shrink-0 items-center justify-center">
                    <svg viewBox="0 0 24 24" width="24" height="24" fill="#EA4335"><path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z"/></svg>
                  </span>
                  <div>
                    <p class="text-sm font-medium text-ctp-text">Gmail</p>
                    <p class="text-xs text-ctp-subtext0">Google Workspace or personal Gmail</p>
                  </div>
                </button>
                <button
                  type="button"
                  class="flex w-full items-center gap-3 rounded-lg border border-ctp-surface1 p-3 text-left transition-colors hover:border-ctp-mauve hover:bg-ctp-mauve/5"
                  :disabled="emxConnecting"
                  @click="connectExchange('outlook')"
                >
                  <span class="flex h-8 w-8 shrink-0 items-center justify-center">
                    <svg viewBox="0 0 512 512" width="24" height="24"><rect width="231" height="270" x="168" y="107" fill="#05a" rx="3%"/><path fill="#136" d="M398 247v23l15-8s0-7-5-9l-10-6zm-230 43v70h77v-70h-77z"/><path fill="#17d" d="M168 150v70h77v-70h-77zm77 70v70h77v-70h-77zm77 70v70h77v-70h-77z"/><path fill="#3ae" d="M245 150v70h77v-70h-77zm77 70v70h77v-70h-77z"/><path fill="#5cf" d="M322 150h77v70h-77z"/><path fill="#19e" d="M413 261 282 336s121 73 124 71c5-3 7-11 7-18V261Z"/><path fill="#2ae" d="M160 266c-4 3-6 7-6 12v117c0 8 6 14 14 14h230c4 0 5 0 8-2"/><rect width="172" height="172" x="70" y="172" fill="#18e" rx="3%"/><path fill="#fff" d="M155 230c14 0 22 11 22 29s-9 28-23 28c-11 0-22-10-22-28 0-15 7-29 23-29Zm-1 75c26 0 44-18 44-47 0-25-16-46-43-46-28 0-44 20-44 48 0 27 20 45 43 45Z"/></svg>
                  </span>
                  <div>
                    <p class="text-sm font-medium text-ctp-text">Outlook</p>
                    <p class="text-xs text-ctp-subtext0">Microsoft 365 or Outlook.com</p>
                  </div>
                </button>
                <button
                  type="button"
                  class="flex w-full items-center gap-3 rounded-lg border border-ctp-surface1 p-3 text-left transition-colors hover:border-ctp-mauve hover:bg-ctp-mauve/5"
                  @click="emxDialogView = 'imap-form'"
                >
                  <span class="flex h-8 shrink-0 items-center justify-center rounded bg-ctp-teal/10 px-2 text-xs font-bold tracking-wide text-ctp-teal">IMAP</span>
                  <div>
                    <p class="text-sm font-medium text-ctp-text">IMAP</p>
                    <p class="text-xs text-ctp-subtext0">Any mail server — Fastmail, ProtonMail Bridge, self-hosted</p>
                  </div>
                </button>
                <button
                  type="button"
                  class="flex w-full items-center gap-3 rounded-lg border border-ctp-surface1 p-3 text-left transition-colors hover:border-ctp-mauve hover:bg-ctp-mauve/5"
                  @click="emxDialogView = 'jmap-form'"
                >
                  <span class="flex h-8 shrink-0 items-center justify-center rounded bg-ctp-sapphire/10 px-2 text-xs font-bold tracking-wide text-ctp-sapphire">JMAP</span>
                  <div>
                    <p class="text-sm font-medium text-ctp-text">JMAP</p>
                    <p class="text-xs text-ctp-subtext0">Fastmail, Stalwart, Cyrus — auto-discovery supported</p>
                  </div>
                </button>
              </div>
              <div class="mt-4 flex justify-end">
                <button
                  type="button"
                  class="rounded-lg border border-ctp-surface1 px-4 py-2 text-sm text-ctp-subtext1 hover:border-ctp-surface2 hover:text-ctp-text"
                  @click="closeEmxDialog"
                >
                  Cancel
                </button>
              </div>
            </div>

            <!-- IMAP form view -->
            <div v-else-if="emxDialogView === 'imap-form'" key="imap-form" class="p-6">
              <div class="mb-4 flex items-center gap-2">
                <button
                  type="button"
                  class="rounded p-1 text-ctp-subtext0 hover:bg-ctp-surface0 hover:text-ctp-text"
                  @click="emxDialogView = 'picker'"
                >
                  <svg class="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 12L6 8l4-4"/></svg>
                </button>
                <h2 class="text-sm font-semibold text-ctp-text">{{ imapEditingEmx ? 'Edit IMAP connection' : 'Connect via IMAP' }}</h2>
              </div>

              <div class="space-y-3">
                <div>
                  <label for="imap-host" class="mb-1 block text-xs font-medium text-ctp-subtext0">Server host</label>
                  <input
                    id="imap-host"
                    v-model="imapFormHost"
                    type="text"
                    placeholder="imap.example.com"
                    class="w-full rounded-lg border border-ctp-surface1 bg-ctp-mantle px-3 py-2 text-sm text-ctp-text placeholder-ctp-overlay0 focus:border-ctp-mauve focus:outline-none"
                  />
                </div>
                <div>
                  <label for="imap-username" class="mb-1 block text-xs font-medium text-ctp-subtext0">Username</label>
                  <input
                    id="imap-username"
                    v-model="imapFormUsername"
                    type="text"
                    placeholder="user@example.com"
                    class="w-full rounded-lg border border-ctp-surface1 bg-ctp-mantle px-3 py-2 text-sm text-ctp-text placeholder-ctp-overlay0 focus:border-ctp-mauve focus:outline-none"
                  />
                </div>
                <div>
                  <label for="imap-password" class="mb-1 block text-xs font-medium text-ctp-subtext0">Password</label>
                  <input
                    id="imap-password"
                    v-model="imapFormPassword"
                    type="password"
                    placeholder="App password or account password"
                    class="w-full rounded-lg border border-ctp-surface1 bg-ctp-mantle px-3 py-2 text-sm text-ctp-text placeholder-ctp-overlay0 focus:border-ctp-mauve focus:outline-none"
                  />
                </div>
                <div>
                  <span class="mb-1 block text-xs font-medium text-ctp-subtext0">Encryption</span>
                  <div class="flex gap-2" role="group" aria-label="Encryption">
                    <button
                      type="button"
                      class="rounded-full border px-3 py-1 text-xs font-medium transition-colors"
                      :class="imapFormTls === 'TLS' ? 'border-ctp-mauve bg-ctp-mauve/10 text-ctp-mauve' : 'border-ctp-surface1 text-ctp-subtext0 hover:border-ctp-surface2'"
                      @click="imapFormTls = 'TLS'"
                    >
                      TLS (port 993)
                    </button>
                    <button
                      type="button"
                      class="rounded-full border px-3 py-1 text-xs font-medium transition-colors"
                      :class="imapFormTls === 'DISABLED' ? 'border-ctp-mauve bg-ctp-mauve/10 text-ctp-mauve' : 'border-ctp-surface1 text-ctp-subtext0 hover:border-ctp-surface2'"
                      @click="imapFormTls = 'DISABLED'"
                    >
                      None (port 143)
                    </button>
                  </div>
                </div>
              </div>

              <div v-if="imapFormError" class="mt-3 rounded border border-ctp-red bg-ctp-red/10 px-3 py-2 text-xs text-ctp-red">
                {{ imapFormError }}
              </div>

              <div class="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  class="rounded-lg border border-ctp-surface1 px-4 py-2 text-sm text-ctp-subtext1 hover:border-ctp-surface2 hover:text-ctp-text"
                  @click="closeEmxDialog"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  class="rounded-lg bg-ctp-mauve px-4 py-2 text-sm font-medium text-ctp-base hover:opacity-90 disabled:opacity-50"
                  :disabled="imapFormSaving || !imapFormHost || !imapFormUsername || (!imapEditingEmx && !imapFormPassword)"
                  @click="submitImapForm"
                >
                  {{ imapFormSaving ? 'Connecting…' : imapEditingEmx ? 'Save' : 'Connect' }}
                </button>
              </div>
              <!-- Disconnect (edit mode only) -->
              <button
                v-if="imapEditingEmx"
                type="button"
                class="mt-4 w-full rounded-lg border border-ctp-red/30 px-3 py-2 text-sm text-ctp-red hover:bg-ctp-red/10"
                @click="deleteExchange(imapEditingEmx!); closeEmxDialog()"
              >
                Disconnect
              </button>
            </div>

            <!-- JMAP form view -->
            <div v-else-if="emxDialogView === 'jmap-form'" key="jmap-form" class="p-6">
              <div class="mb-4 flex items-center gap-2">
                <button
                  type="button"
                  class="rounded p-1 text-ctp-subtext0 hover:bg-ctp-surface0 hover:text-ctp-text"
                  @click="jmapStep === 'credentials' && !jmapEditingEmx ? (jmapStep = 'email') : (emxDialogView = 'picker')"
                >
                  <svg class="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 12L6 8l4-4"/></svg>
                </button>
                <h2 class="text-sm font-semibold text-ctp-text">{{ jmapEditingEmx ? 'Edit JMAP connection' : 'Connect via JMAP' }}</h2>
              </div>

              <!-- Step 1: Email discovery -->
              <div v-if="jmapStep === 'email'" class="space-y-3">
                <div>
                  <label for="jmap-email" class="mb-1 block text-xs font-medium text-ctp-subtext0">Email address</label>
                  <input
                    id="jmap-email"
                    v-model="jmapEmail"
                    type="email"
                    placeholder="you@fastmail.com"
                    class="w-full rounded-lg border border-ctp-surface1 bg-ctp-mantle px-3 py-2 text-sm text-ctp-text placeholder-ctp-overlay0 focus:border-ctp-mauve focus:outline-none"
                    @keydown.enter.prevent="jmapDiscover"
                  />
                  <p class="mt-1 text-xs text-ctp-subtext0">We'll try to auto-discover your JMAP server settings.</p>
                </div>

                <div v-if="jmapFormError" class="rounded border border-ctp-red bg-ctp-red/10 px-3 py-2 text-xs text-ctp-red">
                  {{ jmapFormError }}
                </div>

                <div class="flex justify-end gap-2">
                  <button
                    type="button"
                    class="rounded-lg border border-ctp-surface1 px-4 py-2 text-sm text-ctp-subtext1 hover:border-ctp-surface2 hover:text-ctp-text"
                    @click="closeEmxDialog"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    class="rounded-lg bg-ctp-mauve px-4 py-2 text-sm font-medium text-ctp-base hover:opacity-90 disabled:opacity-50"
                    :disabled="jmapDiscovering || !jmapEmail.trim().includes('@')"
                    @click="jmapDiscover"
                  >
                    {{ jmapDiscovering ? 'Discovering…' : 'Discover' }}
                  </button>
                </div>
              </div>

              <!-- Step 2: Credentials -->
              <div v-else class="space-y-3">
                <div>
                  <label for="jmap-session-url" class="mb-1 block text-xs font-medium text-ctp-subtext0">Session URL</label>
                  <input
                    id="jmap-session-url"
                    v-model="jmapSessionUrl"
                    type="url"
                    placeholder="https://api.fastmail.com/jmap/session"
                    :readonly="jmapSessionDiscovered"
                    class="w-full rounded-lg border border-ctp-surface1 bg-ctp-mantle px-3 py-2 text-sm text-ctp-text placeholder-ctp-overlay0 focus:border-ctp-mauve focus:outline-none"
                    :class="{ 'opacity-60': jmapSessionDiscovered }"
                  />
                  <p v-if="jmapSessionDiscovered" class="mt-1 text-xs text-ctp-green">✓ Auto-discovered</p>
                </div>
                <div>
                  <label for="jmap-username" class="mb-1 block text-xs font-medium text-ctp-subtext0">Username</label>
                  <input
                    id="jmap-username"
                    v-model="jmapUsername"
                    type="text"
                    placeholder="you@fastmail.com"
                    class="w-full rounded-lg border border-ctp-surface1 bg-ctp-mantle px-3 py-2 text-sm text-ctp-text placeholder-ctp-overlay0 focus:border-ctp-mauve focus:outline-none"
                  />
                </div>
                <div>
                  <label for="jmap-password" class="mb-1 block text-xs font-medium text-ctp-subtext0">Password</label>
                  <input
                    id="jmap-password"
                    v-model="jmapPassword"
                    type="password"
                    placeholder="App password or account password"
                    class="w-full rounded-lg border border-ctp-surface1 bg-ctp-mantle px-3 py-2 text-sm text-ctp-text placeholder-ctp-overlay0 focus:border-ctp-mauve focus:outline-none"
                  />
                </div>

                <div v-if="jmapFormError" class="rounded border border-ctp-red bg-ctp-red/10 px-3 py-2 text-xs text-ctp-red">
                  {{ jmapFormError }}
                </div>

                <div class="mt-4 flex justify-end gap-2">
                  <button
                    type="button"
                    class="rounded-lg border border-ctp-surface1 px-4 py-2 text-sm text-ctp-subtext1 hover:border-ctp-surface2 hover:text-ctp-text"
                    @click="closeEmxDialog"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    class="rounded-lg bg-ctp-mauve px-4 py-2 text-sm font-medium text-ctp-base hover:opacity-90 disabled:opacity-50"
                    :disabled="jmapFormSaving || !jmapSessionUrl || !jmapUsername || (!jmapEditingEmx && !jmapPassword)"
                    @click="submitJmapForm"
                  >
                    {{ jmapFormSaving ? 'Connecting…' : jmapEditingEmx ? 'Save' : 'Connect' }}
                  </button>
                </div>
                <!-- Disconnect (edit mode only) -->
                <button
                  v-if="jmapEditingEmx"
                  type="button"
                  class="mt-4 w-full rounded-lg border border-ctp-red/30 px-3 py-2 text-sm text-ctp-red hover:bg-ctp-red/10"
                  @click="deleteExchange(jmapEditingEmx!); closeEmxDialog()"
                >
                  Disconnect
                </button>
              </div>
            </div>
          </Transition>
        </div>
      </div>
    </Teleport>

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

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAccountStore } from '@/stores/account'
import { api } from '@/lib/api'
import type {
  Domain,
  EmailAddressConfig,
  ForwardingAddress,
  UnknownSenderPolicy,
  TeamMember,
  UserRole,
} from '@/types/server'

const route = useRoute()
const router = useRouter()
const accountStore = useAccountStore()

type TabKey = 'account' | 'emails' | 'domains' | 'forwarding' | 'team' | 'notifications'
const activeTab = ref<TabKey>('account')

// ─── Account profile tab ─────────────────────────────────────────────────────
const accountName = ref('')
const accountPending = ref(false)
const accountSaved = ref(false)

async function saveAccount() {
  if (!accountStore.accountId) return
  accountPending.value = true
  accountSaved.value = false
  const result = await api.updateAccount(accountStore.accountId, { name: accountName.value.trim() })
  accountPending.value = false
  if (result.isOk()) {
    accountStore.account = result.value
    accountSaved.value = true
    setTimeout(() => {
      accountSaved.value = false
    }, 2000)
  }
}

// ─── Email addresses tab ──────────────────────────────────────────────────────
const aliases = ref<EmailAddressConfig[]>([])
const aliasesLoading = ref(false)
const aliasError = ref('')
const newAddress = ref('')
const newAddressPending = ref(false)

const FILTER_MODES: { value: UnknownSenderPolicy; label: string; description: string }[] = [
  { value: 'allow_all', label: 'Allow all', description: 'All senders pass through' },
  { value: 'quarantine_visible', label: 'Quarantine (visible)', description: 'Unknown senders held for review' },
  { value: 'quarantine_hidden', label: 'Quarantine (hidden)', description: 'Unknown senders silently held' },
  { value: 'block_hidden', label: 'Block silently', description: 'Unknown senders silently discarded' },
  { value: 'block_reject', label: 'Block & reject', description: 'Unknown senders receive a bounce' },
  { value: 'violate_report', label: 'Violation report', description: 'Report as a policy violation' },
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

async function deleteAddress(address: string) {
  if (!accountStore.accountId) return
  if (!confirm(`Remove ${address}?`)) return
  const result = await api.deleteAlias(accountStore.accountId, address)
  if (result.isOk()) aliases.value = aliases.value.filter((a) => a.address !== address)
}

// ─── Domains tab ──────────────────────────────────────────────────────────────
const domains = ref<Domain[]>([])
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
    domains.value = domains.value.map((d) => (d.id === domainId ? result.value : d))
  }
}

const STATUS_COLORS: Record<string, string> = {
  verified: 'text-ctp-green',
  pending: 'text-ctp-yellow',
  failed: 'text-ctp-red',
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

async function removeForwarding(id: string) {
  if (!accountStore.accountId) return
  const result = await api.deleteForwardingAddress(accountStore.accountId, id)
  if (result.isOk()) forwarding.value = forwarding.value.filter((f) => f.id !== id)
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

async function removeMember(userId: string, email: string) {
  if (!accountStore.accountId) return
  if (!confirm(`Remove ${email} from the team?`)) return
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

// ─── Tab loading ──────────────────────────────────────────────────────────────
async function switchTab(tab: TabKey) {
  activeTab.value = tab
  void router.replace({ query: tab === 'account' ? {} : { tab } })
  if (tab === 'emails' && aliases.value.length === 0) await loadAliases()
  if (tab === 'domains' && domains.value.length === 0) await loadDomains()
  if (tab === 'forwarding' && forwarding.value.length === 0) await loadForwarding()
  if (tab === 'team' && team.value.length === 0) await loadTeam()
}

onMounted(async () => {
  if (!accountStore.accountId) await accountStore.fetchAccount()
  if (accountStore.account) {
    accountName.value = accountStore.account.name
    emailNotifAddress.value = accountStore.account.notifications?.email?.address ?? ''
    emailNotifEnabled.value = accountStore.account.notifications?.email?.enabled ?? false
    emailNotifFrequency.value = accountStore.account.notifications?.email?.frequency ?? 'daily'
  }
  // Hydrate active tab from URL
  const VALID_TABS: TabKey[] = [
    'account',
    'emails',
    'domains',
    'forwarding',
    'team',
    'notifications',
  ]
  const tab = route.query.tab as TabKey | undefined
  if (tab && VALID_TABS.includes(tab)) await switchTab(tab)
})

const TABS: { key: TabKey; label: string }[] = [
  { key: 'account', label: 'Account' },
  { key: 'emails', label: 'Email addresses' },
  { key: 'domains', label: 'Domains' },
  { key: 'forwarding', label: 'Forwarding' },
  { key: 'team', label: 'Team' },
  { key: 'notifications', label: 'Notifications' },
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
      <!-- ── Account tab ─────────────────────────────────────────────────── -->
      <section v-if="activeTab === 'account'" class="space-y-6">
        <div>
          <label for="account-name" class="mb-1 block text-xs font-medium text-ctp-subtext0">Account name</label>
          <div class="flex gap-2">
            <input
              id="account-name"
              v-model="accountName"
              type="text"
              class="flex-1 rounded-lg border border-ctp-surface1 bg-ctp-mantle px-3 py-2 text-sm text-ctp-text focus:border-ctp-mauve focus:outline-none"
            />
            <button
              :disabled="accountPending || !accountName.trim()"
              class="rounded-lg bg-ctp-mauve px-4 py-2 text-sm font-medium text-ctp-base hover:opacity-90 disabled:opacity-50"
              @click="saveAccount"
            >
              {{ accountPending ? 'Saving…' : accountSaved ? 'Saved ✓' : 'Save' }}
            </button>
          </div>
        </div>
        <div>
          <span class="mb-1 block text-xs font-medium text-ctp-subtext0">Account ID</span>
          <p class="font-mono text-xs text-ctp-subtext0">{{ accountStore.accountId }}</p>
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
        <!-- Add address -->
        <form class="mb-4 flex gap-2" @submit.prevent="addAddress">
          <input
            v-model="newAddress"
            type="email"
            aria-label="New email address"
            placeholder="you@domain.com"
            class="flex-1 rounded-lg border border-ctp-surface1 bg-ctp-mantle px-3 py-2 text-sm text-ctp-text placeholder:text-ctp-subtext0 focus:border-ctp-mauve focus:outline-none"
          />
          <button
            type="submit"
            :disabled="newAddressPending || !newAddress.trim()"
            class="rounded-lg bg-ctp-mauve px-4 py-2 text-sm font-medium text-ctp-base hover:opacity-90 disabled:opacity-50"
          >
            {{ newAddressPending ? 'Adding…' : 'Add' }}
          </button>
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
          <div v-for="alias in aliases" :key="alias.id" class="px-4 py-3">
            <div class="flex items-center justify-between gap-2">
              <p class="text-sm font-medium text-ctp-text">{{ alias.address }}</p>
              <button
                class="text-xs text-ctp-red hover:text-ctp-red/80"
                @click="deleteAddress(alias.address)"
              >
                Remove
              </button>
            </div>
            <div class="mt-2 flex flex-wrap gap-1">
              <button
                v-for="mode in FILTER_MODES"
                :key="mode.value"
                class="rounded-full border px-2.5 py-0.5 text-xs transition-colors"
                :class="
                  alias.unknownSenderPolicy === mode.value
                    ? 'border-ctp-mauve bg-ctp-mauve/10 text-ctp-mauve'
                    : 'border-ctp-surface1 text-ctp-subtext0 hover:border-ctp-surface2 hover:text-ctp-text'
                "
                @click="updateAliasMode(alias.address, mode.value)"
              >
                {{ mode.label }}
              </button>
            </div>
            <p class="mt-1 text-xs text-ctp-subtext0">
              {{ FILTER_MODES.find((m) => m.value === alias.unknownSenderPolicy)?.description }}
            </p>
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
          <button
            type="submit"
            :disabled="addDomainPending || !newDomain.trim()"
            class="rounded-lg bg-ctp-mauve px-4 py-2 text-sm font-medium text-ctp-base hover:opacity-90 disabled:opacity-50"
          >
            {{ addDomainPending ? 'Adding…' : 'Add domain' }}
          </button>
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
            :key="domain.id"
            class="rounded-lg border border-ctp-surface1"
          >
            <!-- Domain header -->
            <div class="flex items-center justify-between gap-2 px-4 py-3">
              <div>
                <p class="text-sm font-medium text-ctp-text">{{ domain.domain }}</p>
                <p class="text-xs" :class="STATUS_COLORS[domain.status] ?? 'text-ctp-subtext0'">
                  {{ domain.status.charAt(0).toUpperCase() + domain.status.slice(1) }}
                </p>
              </div>
              <button
                v-if="domain.status !== 'verified'"
                :disabled="recheckPending.has(domain.id)"
                class="rounded border border-ctp-surface1 px-3 py-1.5 text-xs text-ctp-subtext1 transition-colors hover:border-ctp-surface2 hover:text-ctp-text disabled:opacity-50"
                @click="recheckDomain(domain.id)"
              >
                {{ recheckPending.has(domain.id) ? 'Checking…' : 'Re-check DNS' }}
              </button>
            </div>
            <!-- DNS records — two-tier display -->
            <div class="border-t border-ctp-surface0">
              <div
                v-for="(rec, i) in domain.dnsRecords"
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
                      <span class="truncate font-mono text-xs text-ctp-text">{{ rec.host }}</span>
                    </div>
                    <p class="mt-1 break-all font-mono text-xs text-ctp-subtext0">
                      {{ rec.value }}
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
                      @click="copyDnsValue(`${domain.id}-${i}`, rec.value)"
                    >
                      {{ copiedDns.has(`${domain.id}-${i}`) ? '✓' : 'Copy' }}
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
        <form
          class="mb-4 grid gap-2 sm:grid-cols-[1fr_1fr_auto]"
          @submit.prevent="addForwardingAddress"
        >
          <input
            v-model="newForwardAddress"
            type="email"
            aria-label="Forwarding address"
            placeholder="forward@example.com"
            class="rounded-lg border border-ctp-surface1 bg-ctp-mantle px-3 py-2 text-sm text-ctp-text placeholder:text-ctp-subtext0 focus:border-ctp-mauve focus:outline-none"
          />
          <button
            type="submit"
            :disabled="addForwardPending || !newForwardAddress.trim()"
            class="rounded-lg bg-ctp-mauve px-4 py-2 text-sm font-medium text-ctp-base hover:opacity-90 disabled:opacity-50"
          >
            {{ addForwardPending ? 'Adding…' : 'Add' }}
          </button>
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
            :key="fwd.id"
            class="flex items-center justify-between px-4 py-3"
          >
            <div>
              <p class="text-sm text-ctp-text">{{ fwd.address }}</p>
              <p class="text-xs text-ctp-subtext0">{{ fwd.status }}</p>
            </div>
            <button
              class="text-xs text-ctp-red hover:text-ctp-red/80"
              @click="removeForwarding(fwd.id)"
            >
              Remove
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
          <button
            type="submit"
            :disabled="invitePending || !inviteEmail.trim()"
            class="self-start rounded-lg bg-ctp-mauve px-4 py-2 text-sm font-medium text-ctp-base hover:opacity-90 disabled:opacity-50"
          >
            {{ invitePending ? 'Inviting…' : 'Invite' }}
          </button>
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
          <div v-for="member in team" :key="member.id" class="flex items-center gap-3 px-4 py-3">
            <div class="flex-1">
              <p class="text-sm font-medium text-ctp-text">{{ member.name || member.email }}</p>
              <p v-if="member.name" class="text-xs text-ctp-subtext0">{{ member.email }}</p>
              <span
                class="mt-0.5 inline-block rounded-full px-2 py-0.5 text-xs"
                :class="
                  member.status === 'active'
                    ? 'bg-ctp-green/10 text-ctp-green'
                    : 'bg-ctp-surface1 text-ctp-subtext0'
                "
              >
                {{ member.status }}
              </span>
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
              @click="removeMember(member.userId, member.email)"
            >
              Remove
            </button>
          </div>
        </div>
      </section>

      <!-- ── Notifications tab ──────────────────────────────────────────── -->
      <section v-else-if="activeTab === 'notifications'" class="space-y-6">
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

        <button
          :disabled="notifPending"
          class="rounded-lg bg-ctp-mauve px-4 py-2 text-sm font-medium text-ctp-base hover:opacity-90 disabled:opacity-50"
          @click="saveNotifications"
        >
          {{ notifPending ? 'Saving…' : notifSaved ? 'Saved ✓' : 'Save preferences' }}
        </button>
      </section>
    </main>
  </div>
</template>

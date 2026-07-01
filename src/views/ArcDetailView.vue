<script setup lang="ts">
import { onMounted, onUnmounted, computed, ref, nextTick } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import { useSignalsStore } from '@/stores/signals'
import { useArcsStore } from '@/stores/arcs'
import { useAccountStore } from '@/stores/account'
import { useToast } from '@/composables/useToast'
import { useConfirmDialog } from '@/composables/useConfirmDialog'
import { isInboundEmailSignal } from '@/lib/signal-guards'
import { retentionExpiresAt } from '@/lib/retention'
import { groupByBodyFingerprint, attachLinkedSignals } from '@/lib/dedup'
import { visibleLabels, findLabelMeta } from '@/lib/labels'
import { useLabelsStore } from '@/stores/labels'
import { api } from '@/lib/api'
import WorkflowPanel from '@/components/WorkflowPanel.vue'
import SignalRenderer from '@/components/SignalRenderer.vue'
import DraftSignalCard from '@/components/DraftSignalCard.vue'
import PendingSendCard from '@/components/PendingSendCard.vue'
import AsyncButton from '@/components/ui/AsyncButton.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import CopyMenuItem from '@/components/CopyMenuItem.vue'
import type { Arc } from '@/types/server'

const route = useRoute()
const router = useRouter()
const signalsStore = useSignalsStore()
const arcsStore = useArcsStore()
const accountStore = useAccountStore()
const labelsStore = useLabelsStore()
const { showUndo, deferAction } = useToast()
const { dialogOpen, dialogOptions, confirm: confirmAction, onConfirm, onCancel } = useConfirmDialog()

const overflowOpen = ref(false)
const arcData = ref<Arc | null>(null)

const arcId = computed(() => route.params.id as string)
const threadId = computed(() => arcId.value)

const dedupedSignals = computed(() => attachLinkedSignals(groupByBodyFingerprint(signalsStore.items)))

// Sender domain to block, derived from the arc's denormalised sender address
const senderDomain = computed(() => {
  const sender = arc.value?.senderAddress
  const at = sender?.lastIndexOf('@') ?? -1
  return at >= 0 ? sender!.slice(at + 1) : null
})

// Look up arc from arcsStore items first, fall back to locally fetched data
const arc = computed(() => {
  const fromStore = arcsStore.items.find((a) => a.arcId === arcId.value)
  return fromStore ?? arcData.value
})

const availableUntil = computed(() => {
  if (!arc.value?.retentionDuration) return null
  return retentionExpiresAt(arc.value.createdAt, arc.value.retentionDuration)
})

const showRetentionWarning = computed(() => {
  if (!availableUntil.value) return false
  const expiryDate = new Date(availableUntil.value)
  const daysUntil = (expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  return daysUntil <= 30
})

const retentionMessage = computed(() => {
  if (!availableUntil.value) return ''
  const expiryDate = new Date(availableUntil.value)
  const daysUntil = Math.round((expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  if (daysUntil < 0) return `This thread was deleted ${Math.abs(daysUntil)} day${Math.abs(daysUntil) === 1 ? '' : 's'} ago`
  return `This thread will be deleted in ${daysUntil} day${daysUntil === 1 ? '' : 's'}`
})

onMounted(async () => {
  signalsStore.reset()
  // Use arcs store for arc metadata — instant if cached, fetches if not
  arcData.value = (await arcsStore.getArcAsync(arcId.value)) ?? null
  await signalsStore.fetchAll(arcId.value)
})

onUnmounted(() => {
  signalsStore.reset()
})

function onDraftDiscard() {
  void signalsStore.fetchAll(arcId.value)
}

function onDraftSent() {
  void signalsStore.fetchAll(arcId.value)
}

function onSignalUndo() {
  void signalsStore.fetchAll(arcId.value)
}

function onSignalReprocessed() {
  void signalsStore.fetchAll(arcId.value)
}

async function archive() {
  const result = await arcsStore.archiveArc(arcId.value)
  if (result.isErr()) return
  const id = arcId.value
  const summary = arc.value?.summary
  showUndo(
    'Thread archived',
    async () => {
      await arcsStore.moveToInbox(id)
    },
    8_000,
    { submessage: summary ? summary.slice(0, 70) : undefined },
  )
  void router.push('/')
}

async function unsubscribe() {
  const result = await arcsStore.unsubscribeArc(arcId.value)
  if (result.isErr()) return
  const url = result.value.url
  void router.push('/')
  if (url) window.open(url, '_blank', 'noopener,noreferrer')
}

const hasUnsubscribe = computed(() =>
  signalsStore.items.some((s) => isInboundEmailSignal(s) && s.data.unsubscribe),
)

async function deleteArc() {
  const confirmed = await confirmAction({
    title: 'Delete thread',
    message: 'Permanently delete this thread and all its messages? This cannot be undone.',
    confirmLabel: 'Delete',
    confirmVariant: 'danger',
  })
  if (!confirmed) return
  const id = arcId.value
  deferAction(
    'Thread deleted',
    async () => {
      await arcsStore.deleteArc(id)
    },
    8_000,
    { undoLabel: 'Undo' },
  )
  void router.push('/')
}

async function blockSender() {
  const domain = senderDomain.value
  const alias = arc.value?.recipientAddress
  if (!domain || !alias) return
  const confirmed = await confirmAction({
    title: 'Block sender',
    message: `Block all future emails from @${domain} to ${alias} and delete this thread? This cannot be undone.`,
    confirmLabel: 'Block & delete',
    confirmVariant: 'danger',
  })
  if (!confirmed) return
  const accountId = accountStore.accountId
  if (accountId) {
    const result = await api.updateAliasSender(accountId, alias, domain, { policy: 'block_reject' })
    if (result.isErr()) return
  }
  const id = arcId.value
  deferAction(
    'Sender blocked, thread deleted',
    async () => {
      await arcsStore.deleteArc(id)
    },
    8_000,
    { undoLabel: 'Undo' },
  )
  void router.push('/')
}

async function loadMore() {
  await signalsStore.fetchMore(arcId.value)
}

const primaryBadgeLabel = computed(() => {
  if (!arc.value) return ''
  if (arc.value.status === 'deleted') return 'Deleted'
  const latestSignal = signalsStore.latestSignal
  if (latestSignal && isInboundEmailSignal(latestSignal) && latestSignal.data.workflowData?.workflow === 'conversation' && latestSignal.data.workflowData.requiresReply) return 'Reply Needed'
  if (arc.value.status === 'archived') return 'Archived'
  return 'Active'
})

const primaryBadgeClass = computed(() => {
  switch (primaryBadgeLabel.value) {
    case 'Deleted': return 'bg-ctp-red/20 text-ctp-red'
    case 'Reply Needed': return 'bg-ctp-peach/20 text-ctp-peach'
    case 'Archived': return 'bg-ctp-surface1 text-ctp-subtext0'
    default: return 'bg-ctp-green/20 text-ctp-green'
  }
})

async function moveToInbox() {
  const result = await arcsStore.moveToInbox(arcId.value)
  if (result.isErr()) return
  // Keep the local fallback in sync with the store's optimistic update.
  arcData.value = result.value
  await signalsStore.fetchAll(arcId.value)
}

async function scrollToDraft(signalId: string) {
  await nextTick()
  document.getElementById(`draft-${signalId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

async function startDraft() {
  const existingDraft = signalsStore.items.find((s) => s.status === 'draft')
  if (existingDraft) {
    await scrollToDraft(existingDraft.signalId)
    return
  }
  const result = await signalsStore.createDraft(arcId.value)
  if (result.isOk()) {
    await scrollToDraft(result.value.signalId)
  }
}

function labelMeta(label: string) {
  return findLabelMeta(labelsStore.items, label)
}

async function removeLabel(label: string) {
  const confirmed = await confirmAction({
    title: 'Remove label',
    message: `Remove "${label}" from this thread?`,
    confirmLabel: 'Remove',
    confirmVariant: 'danger',
  })
  if (!confirmed) return
  if (!arc.value) return
  const currentLabels = arc.value.labels.filter((l) => l !== label)
  const result = await arcsStore.labelArc(arcId.value, currentLabels)
  if (result.isOk()) {
    arcData.value = result.value
    await signalsStore.fetchAll(arcId.value)
  }
}
</script>

<template>
  <div class="arc-detail mx-auto flex min-h-full max-w-[1200px] flex-col px-4 py-6">
    <!-- Top bar: Back link + actions -->
    <div class="mb-4 flex items-center justify-between gap-4">
      <RouterLink
        to="/"
        class="inline-flex items-center gap-1 text-sm text-ctp-subtext0 hover:text-ctp-text"
      >
        ← Back to inbox
      </RouterLink>

      <div v-if="arc" class="flex items-center gap-2">
        <AsyncButton
          v-if="hasUnsubscribe && arc.status === 'active'"
          :action="unsubscribe"
          variant="outline"
          class="flex h-8 items-center gap-1.5 border-ctp-surface1 px-3 text-sm text-ctp-subtext1 hover:border-ctp-peach hover:text-ctp-peach"
        >
          <svg class="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M8 1a7 7 0 100 14A7 7 0 008 1zM4.5 7.5h7v1h-7v-1z"/>
          </svg>
          Unsubscribe
        </AsyncButton>
        <AsyncButton
          v-if="arc.status === 'active'"
          :action="archive"
          variant="outline"
          class="flex h-8 items-center gap-1.5 border-ctp-surface1 px-3 text-sm text-ctp-subtext1 hover:border-ctp-red hover:text-ctp-red"
        >
          <svg class="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M1.5 2h13l-1 2H2.5L1.5 2zm.5 3h12v9a1 1 0 01-1 1H3a1 1 0 01-1-1V5zm4 2v5h5V7H6z"/>
          </svg>
          Archive
        </AsyncButton>
        <AsyncButton
          v-if="arc.status === 'archived' || arc.status === 'deleted'"
          :action="moveToInbox"
          variant="outline"
          class="flex h-8 items-center gap-1.5 border-ctp-surface1 px-3 text-sm text-ctp-subtext1 hover:border-ctp-green hover:text-ctp-green"
        >
          <svg class="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M1 11v3a1 1 0 001 1h12a1 1 0 001-1v-3H9.5l-1 2h-1l-1-2H1zm0-1h4l1 2h4l1-2h4V3a1 1 0 00-1-1H2a1 1 0 00-1 1v7z"/>
          </svg>
          Inbox
        </AsyncButton>

        <!-- Overflow menu -->
        <div v-if="arc.status !== 'deleted'" class="relative">
          <button
            type="button"
            class="flex h-8 w-8 items-center justify-center rounded border border-ctp-surface1 text-ctp-subtext1 hover:border-ctp-overlay0 hover:text-ctp-text"
            aria-label="More actions"
            @click="overflowOpen = !overflowOpen"
          >
            <svg class="h-4 w-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <circle cx="8" cy="3" r="1.5" />
              <circle cx="8" cy="8" r="1.5" />
              <circle cx="8" cy="13" r="1.5" />
            </svg>
          </button>
          <div
            v-if="overflowOpen"
            role="menu"
            tabindex="-1"
            class="absolute right-0 top-full z-10 mt-1 w-44 rounded-lg border border-ctp-surface0 bg-ctp-base py-1 shadow-lg"
            @click="overflowOpen = false"
            @keydown.escape="overflowOpen = false"
          >
            <CopyMenuItem class="px-3" :value="threadId" label="Thread ID" />
            <button
              v-if="senderDomain && arc.recipientAddress"
              type="button"
              role="menuitem"
              class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ctp-red hover:bg-ctp-surface0"
              @click="blockSender()"
            >
              <svg class="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6"/><path d="M4.5 4.5l7 7"/></svg>
              Block sender
            </button>
            <button
              type="button"
              role="menuitem"
              class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ctp-red hover:bg-ctp-surface0"
              @click="deleteArc()"
            >
              <svg class="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4h12M5.333 4V2.667a1.333 1.333 0 011.334-1.334h2.666a1.333 1.333 0 011.334 1.334V4m2 0v9.333a1.333 1.333 0 01-1.334 1.334H4.667a1.333 1.333 0 01-1.334-1.334V4h9.334z"/></svg>
              Delete thread
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Loading -->
    <div
      v-if="signalsStore.loading"
      role="status"
      aria-label="Loading thread…"
      class="animate-pulse"
    >
      <div class="mb-6 space-y-2">
        <div class="h-6 w-2/3 rounded bg-ctp-surface1" />
        <div class="h-3 w-32 rounded bg-ctp-surface1" />
      </div>
      <div class="space-y-4">
        <div v-for="i in 3" :key="i" class="rounded-lg border border-ctp-surface0 bg-ctp-mantle p-4">
          <div class="mb-3 flex items-center gap-2">
            <div class="h-3 w-28 rounded bg-ctp-surface1" />
            <div class="ml-auto h-3 w-16 rounded bg-ctp-surface1" />
          </div>
          <div class="space-y-2">
            <div class="h-4 w-full rounded bg-ctp-surface1" />
            <div class="h-4 rounded bg-ctp-surface1" :style="{ width: `${60 + i * 12}%` }" />
          </div>
        </div>
      </div>
    </div>

    <!-- Error -->
    <div
      v-else-if="signalsStore.error"
      role="alert"
      class="rounded-lg border border-ctp-red bg-ctp-red/10 px-4 py-3 text-sm text-ctp-red"
    >
      {{ signalsStore.error }}
    </div>

    <template v-else-if="arc">
      <!-- Arc header -->
      <div class="mb-6">
        <!-- Line 1: Primary badge + Summary (multiline allowed) -->
        <div class="flex items-start gap-2">
          <span class="mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-xs font-medium" :class="primaryBadgeClass">{{ primaryBadgeLabel }}</span>
          <h1 class="text-lg font-semibold text-ctp-text">{{ arc.summary }}</h1>
        </div>
        <!-- Line 2: From / Alias -->
        <div class="mt-1 flex flex-wrap items-center gap-3 text-sm text-ctp-subtext1">
          <span v-if="arc.senderAddress"><span class="text-ctp-overlay1">From:</span> {{ arc.senderAddress }}</span>
        </div>
        <div v-if="arc.recipientAddress" class="mt-1 text-sm text-ctp-subtext1">
          <span class="text-ctp-overlay1">Alias:</span> <span class="text-ctp-sapphire">{{ arc.recipientAddress }}</span>
        </div>
        <!-- Line 4: Secondary badges (workflow, labels) -->
        <div class="mt-2 flex flex-wrap items-center gap-1.5">
          <span class="rounded-full bg-ctp-surface0 px-2 py-0.5 text-xs capitalize text-ctp-subtext0">{{ arc.workflow }}</span>
          <button
            v-for="label in visibleLabels(arc.labels)"
            :key="label"
            class="flex items-center gap-1 cursor-pointer rounded-full bg-ctp-surface1 px-2 py-0.5 text-xs text-ctp-subtext1 hover:opacity-70"
            @click="removeLabel(label)"
          >
            <span
              v-if="labelMeta(label)"
              class="h-2 w-2 shrink-0 rounded-full"
              :style="{ backgroundColor: labelMeta(label)!.color }"
            />
            {{ labelMeta(label)?.name ?? label }}
          </button>
        </div>
        <div v-if="arc.status === 'deleted' && arc.deletedAt" class="mt-2 text-xs text-ctp-subtext0">
          Deleted on {{ new Date(arc.deletedAt).toLocaleDateString(undefined, { dateStyle: 'medium' }) }}
        </div>
      </div>

      <!-- Retention: always-visible expiry date -->
      <RouterLink
        v-if="availableUntil"
        :to="{ name: 'settings', query: { tab: 'email' } }"
        class="mb-2 block cursor-pointer text-xs text-ctp-subtext0 no-underline hover:text-ctp-text hover:underline"
      >
        Available until {{ availableUntil }}
      </RouterLink>

      <div v-if="signalsStore.items.length > 0" class="mb-2">
        <span class="inline-block rounded-full px-2 py-0.5 text-xs font-medium" :class="primaryBadgeClass">
          {{ signalsStore.items.length }}{{ signalsStore.hasMore ? '+' : '' }} Signal{{ signalsStore.items.length === 1 && !signalsStore.hasMore ? '' : 's' }}
        </span>
      </div>

      <!-- Retention warning (≤30 days) -->
      <RouterLink
        v-if="showRetentionWarning"
        :to="{ name: 'settings', query: { tab: 'email' } }"
        class="mb-4 block cursor-pointer rounded-lg border border-ctp-peach/30 bg-ctp-peach/10 px-4 py-2 text-xs text-ctp-peach no-underline hover:bg-ctp-peach/15"
      >
        ⚠ {{ retentionMessage }}
      </RouterLink>

      <!-- Workflow panel (from latest signal with workflowData) -->
      <div v-if="signalsStore.latestSignal && isInboundEmailSignal(signalsStore.latestSignal) && signalsStore.latestSignal.data.workflowData" class="mb-6">
        <WorkflowPanel :signal="signalsStore.latestSignal" />
      </div>

      <!-- Signal thread — newest first, received + draft signals -->
      <div v-if="dedupedSignals.length > 0" class="space-y-4">
        <template v-for="(group, index) in dedupedSignals" :key="group.signal.signalId">
          <DraftSignalCard
            v-if="group.signal.status === 'draft'"
            :id="`draft-${group.signal.signalId}`"
            :signal="group.signal"
            @discard="onDraftDiscard"
            @sent="onDraftSent"
          />
          <PendingSendCard
            v-else-if="group.signal.status === 'pending_send'"
            :signal="group.signal"
            @cancelled="onDraftDiscard"
          />
          <SignalRenderer
            v-else
            :signal="group.signal"
            :linked-signal="group.linkedSignal"
            :default-expanded="index === 0"
            @undo="onSignalUndo"
            @reply="startDraft"
            @reprocessed="onSignalReprocessed"
          />
        </template>
      </div>
      <div v-else class="py-12 text-center">
        <p class="text-sm font-medium text-ctp-text">No signals yet</p>
        <p class="mx-auto mt-1 max-w-sm text-xs text-ctp-subtext0">
          This thread has no recorded messages or events yet.
        </p>
      </div>

      <!-- Load earlier (older) signals — they sort to the bottom -->
      <div v-if="signalsStore.hasMore" class="mt-4">
        <button
          class="text-sm text-ctp-subtext0 hover:text-ctp-text"
          :disabled="signalsStore.loadingMore"
          @click="loadMore"
        >
          {{ signalsStore.loadingMore ? 'Loading…' : 'Load earlier messages' }}
        </button>
      </div>
    </template>

    <ConfirmDialog
      :open="dialogOpen"
      :title="dialogOptions.title"
      :message="dialogOptions.message"
      :confirm-label="dialogOptions.confirmLabel"
      :confirm-variant="dialogOptions.confirmVariant"
      @confirm="onConfirm"
      @cancel="onCancel"
    />
  </div>
</template>

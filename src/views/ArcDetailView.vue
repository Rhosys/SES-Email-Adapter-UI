<script setup lang="ts">
import { onMounted, onUnmounted, computed } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import { useSignalsStore } from '@/stores/signals'
import { useArcsStore } from '@/stores/arcs'
import { useAccountStore } from '@/stores/account'
import { useToast } from '@/composables/useToast'
import { useConfirmDialog } from '@/composables/useConfirmDialog'
import { api } from '@/lib/api'
import { isInboundEmailSignal } from '@/lib/signal-guards'
import { retentionExpiresAt } from '@/lib/retention'
import { groupByBodyFingerprint, attachLinkedSignals } from '@/lib/dedup'
import WorkflowPanel from '@/components/WorkflowPanel.vue'
import SignalRenderer from '@/components/SignalRenderer.vue'
import DraftSignalCard from '@/components/DraftSignalCard.vue'
import AsyncButton from '@/components/ui/AsyncButton.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'

const route = useRoute()
const router = useRouter()
const signalsStore = useSignalsStore()
const arcsStore = useArcsStore()
const accountStore = useAccountStore()
const { showUndo, deferAction } = useToast()
const { dialogOpen, dialogOptions, confirm: confirmAction, onConfirm, onCancel } = useConfirmDialog()

const arcId = computed(() => route.params.id as string)

const dedupedSignals = computed(() => attachLinkedSignals(groupByBodyFingerprint(signalsStore.items)))

const reversedSignals = computed(() => [...dedupedSignals.value].reverse())

const availableUntil = computed(() => {
  const arc = signalsStore.arc
  if (!arc?.retentionDuration) return null
  return retentionExpiresAt(arc.createdAt, arc.retentionDuration)
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
  await accountStore.fetchAccount()
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

async function archive() {
  const result = await arcsStore.archiveArc(arcId.value)
  if (result.isErr()) return
  const id = arcId.value
  const summary = signalsStore.arc?.summary
  showUndo(
    'Thread archived',
    async () => {
      const accountId = accountStore.accountId
      if (!accountId) return
      await api.patchArc(accountId, id, { status: 'active' })
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
  const accountId = accountStore.accountId
  if (!accountId) return
  const id = arcId.value
  deferAction(
    'Thread deleted',
    async () => {
      await api.patchArc(accountId, id, { status: 'deleted' })
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
  const arc = signalsStore.arc
  if (!arc) return ''
  if (arc.status === 'deleted') return 'Deleted'
  const latestSignal = signalsStore.latestSignal
  if (latestSignal && isInboundEmailSignal(latestSignal) && latestSignal.data.workflowData?.workflow === 'conversation' && latestSignal.data.workflowData.requiresReply) return 'Reply Needed'
  if (arc.status === 'archived') return 'Archived'
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
  const id = accountStore.accountId
  if (!id) return
  await api.patchArc(id, arcId.value, { status: 'active' })
  await signalsStore.fetchAll(arcId.value)
}

async function startDraft() {
  await signalsStore.createDraft(arcId.value)
}

async function removeLabel(label: string) {
  const confirmed = await confirmAction({
    title: 'Remove label',
    message: `Remove "${label}" from this thread?`,
    confirmLabel: 'Remove',
    confirmVariant: 'danger',
  })
  if (!confirmed) return
  const id = accountStore.accountId
  if (!id || !signalsStore.arc) return
  const currentLabels = signalsStore.arc.labels.filter((l) => l !== label)
  const result = await api.patchArc(id, arcId.value, { labels: currentLabels })
  if (result.isOk()) await signalsStore.fetchAll(arcId.value)
}
</script>

<template>
  <div class="arc-detail mx-auto flex min-h-full max-w-3xl flex-col px-4 py-6">
    <!-- Back link -->
    <RouterLink
      to="/"
      class="mb-4 inline-flex items-center gap-1 text-sm text-ctp-subtext0 hover:text-ctp-text"
    >
      ← Back to inbox
    </RouterLink>

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

    <template v-else-if="signalsStore.arc">
      <!-- Arc header -->
      <div class="mb-6">
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0 flex-1">
            <!-- Line 1: Primary badge + Summary -->
            <div class="flex items-center gap-2">
              <span class="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium" :class="primaryBadgeClass">{{ primaryBadgeLabel }}</span>
              <h1 class="truncate text-lg font-semibold text-ctp-text">{{ signalsStore.arc.summary }}</h1>
            </div>
            <!-- Line 2: Subject -->
            <p v-if="signalsStore.arc.subject" class="mt-1 text-sm text-ctp-subtext1">{{ signalsStore.arc.subject }}</p>
            <!-- Line 3: From / Alias -->
            <div class="mt-1 flex flex-wrap items-center gap-3 text-sm text-ctp-subtext1">
              <span v-if="signalsStore.arc.senderAddress"><span class="text-ctp-overlay1">From:</span> {{ signalsStore.arc.senderAddress }}</span>
            </div>
            <div v-if="signalsStore.arc.recipientAddress" class="mt-1 text-sm text-ctp-subtext1">
              <span class="text-ctp-overlay1">Alias:</span> <span class="text-ctp-sapphire">{{ signalsStore.arc.recipientAddress }}</span>
            </div>
            <!-- Line 4: Secondary badges (workflow, labels) -->
            <div class="mt-2 flex flex-wrap items-center gap-1.5">
              <span class="rounded-full bg-ctp-surface0 px-2 py-0.5 text-xs capitalize text-ctp-subtext0">{{ signalsStore.arc.workflow }}</span>
              <button
                v-for="label in signalsStore.arc.labels"
                :key="label"
                class="cursor-pointer rounded-full bg-ctp-surface1 px-2 py-0.5 text-xs text-ctp-subtext1 hover:opacity-70"
                @click="removeLabel(label)"
              >
                {{ label }}
              </button>
            </div>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <AsyncButton
              v-if="hasUnsubscribe && signalsStore.arc.status === 'active'"
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
              v-if="signalsStore.arc.status === 'active'"
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
              v-if="signalsStore.arc.status === 'archived'"
              :action="moveToInbox"
              variant="outline"
              class="flex h-8 items-center gap-1.5 border-ctp-surface1 px-3 text-sm text-ctp-subtext1 hover:border-ctp-green hover:text-ctp-green"
            >
              Move to Inbox
            </AsyncButton>
            <AsyncButton
              v-if="signalsStore.arc.status !== 'deleted'"
              :action="deleteArc"
              variant="outline"
              class="flex h-8 items-center gap-1.5 border-ctp-surface1 px-3 text-sm text-ctp-subtext1 hover:border-ctp-red hover:text-ctp-red"
            >
              <svg class="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4h12M5.333 4V2.667a1.333 1.333 0 011.334-1.334h2.666a1.333 1.333 0 011.334 1.334V4m2 0v9.333a1.333 1.333 0 01-1.334 1.334H4.667a1.333 1.333 0 01-1.334-1.334V4h9.334z"/></svg>
            </AsyncButton>
          </div>
        </div>
        <div v-if="signalsStore.arc.status === 'deleted' && signalsStore.arc.deletedAt" class="mt-2 text-xs text-ctp-subtext0">
          Deleted on {{ new Date(signalsStore.arc.deletedAt).toLocaleDateString(undefined, { dateStyle: 'medium' }) }}
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

      <!-- Load more older signals -->
      <div v-if="signalsStore.hasMore" class="mb-4">
        <button
          class="text-sm text-ctp-subtext0 hover:text-ctp-text"
          :disabled="signalsStore.loadingMore"
          @click="loadMore"
        >
          {{ signalsStore.loadingMore ? 'Loading…' : 'Load earlier messages' }}
        </button>
      </div>

      <!-- Signal thread — received + draft signals -->
      <div class="space-y-4">
        <template v-for="group in reversedSignals" :key="group.signal.signalId">
          <DraftSignalCard
            v-if="group.signal.status === 'draft'"
            :signal="group.signal"
            @discard="onDraftDiscard"
            @sent="onDraftSent"
          />
          <SignalRenderer v-else :signal="group.signal" :linked-signal="group.linkedSignal" @undo="onSignalUndo" @reply="startDraft" />
        </template>
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

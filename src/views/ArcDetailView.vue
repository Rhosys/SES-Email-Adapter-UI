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
const { showUndo } = useToast()
const { dialogOpen, dialogOptions, confirm: confirmAction, onConfirm, onCancel } = useConfirmDialog()

const arcId = computed(() => route.params.id as string)

const dedupedSignals = computed(() => attachLinkedSignals(groupByBodyFingerprint(signalsStore.items)))

const reversedSignals = computed(() => [...dedupedSignals.value].reverse())

const availableUntil = computed(() => {
  const arc = signalsStore.arc
  if (!arc?.retentionDuration) return null
  return retentionExpiresAt(arc.createdAt, arc.retentionDuration)
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
      await signalsStore.fetchAll(id)
    },
    8_000,
    { submessage: summary ? summary.slice(0, 70) : undefined },
  )
}

async function deleteArc() {
  const confirmed = await confirmAction({
    title: 'Delete thread',
    message: 'Permanently delete this thread and all its messages? This cannot be undone.',
    confirmLabel: 'Delete',
    confirmVariant: 'danger',
  })
  if (!confirmed) return
  const id = accountStore.accountId
  if (!id) return
  await api.patchArc(id, arcId.value, { status: 'deleted' })
  void router.push('/')
}

async function loadMore() {
  await signalsStore.fetchMore(arcId.value)
}

const showReply = computed(() => {
  const workflow = signalsStore.arc?.workflow
  return workflow !== 'test'
})

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
  <div class="arc-detail mx-auto flex min-h-screen max-w-3xl flex-col px-4 py-6">
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
          <div class="flex items-center gap-2">
            <span class="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium capitalize" :class="{
              'bg-ctp-green/20 text-ctp-green': signalsStore.arc.status === 'active',
              'bg-ctp-surface1 text-ctp-subtext0': signalsStore.arc.status === 'archived',
              'bg-ctp-red/20 text-ctp-red': signalsStore.arc.status === 'deleted',
            }">{{ signalsStore.arc.status }}</span>
            <span class="rounded-full bg-ctp-surface0 px-2 py-0.5 text-xs capitalize text-ctp-subtext0">{{ signalsStore.arc.workflow }}</span>
            <h1 class="text-xl font-semibold text-ctp-text">{{ signalsStore.arc.summary }}</h1>
          </div>
          <div class="flex shrink-0 items-center gap-2">
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
              v-if="signalsStore.arc.status !== 'deleted'"
              :action="deleteArc"
              variant="outline"
              class="flex h-8 items-center gap-1.5 border-ctp-surface1 px-3 text-sm text-ctp-subtext1 hover:border-ctp-red hover:text-ctp-red"
            >
              <svg class="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4h12M5.333 4V2.667a1.333 1.333 0 011.334-1.334h2.666a1.333 1.333 0 011.334 1.334V4m2 0v9.333a1.333 1.333 0 01-1.334 1.334H4.667a1.333 1.333 0 01-1.334-1.334V4h9.334z"/></svg>
            </AsyncButton>
            <button
              v-if="showReply"
              class="flex h-8 items-center gap-1.5 rounded-lg border border-ctp-surface1 px-3 text-sm text-ctp-subtext1 hover:border-ctp-mauve hover:text-ctp-mauve"
              @click="startDraft"
            >
              Reply
            </button>
          </div>
        </div>
        <p v-if="signalsStore.arc.subject" class="mt-1 text-sm text-ctp-subtext1">{{ signalsStore.arc.subject }}</p>
        <p v-if="signalsStore.arc.senderAddress" class="mt-1 text-xs text-ctp-subtext0"><span class="text-ctp-overlay1">From:</span> {{ signalsStore.arc.senderAddress }}</p>
        <p v-if="signalsStore.arc.recipientAddress" class="mt-1 text-xs text-ctp-subtext0"><span class="text-ctp-overlay1">Alias:</span> <span class="rounded-full bg-ctp-surface1 px-2 py-0.5 text-ctp-subtext1">{{ signalsStore.arc.recipientAddress }}</span></p>
        <div class="mt-2 flex flex-wrap items-center gap-2">
          <span v-if="signalsStore.arc.status === 'deleted' && signalsStore.arc.deletedAt" class="text-xs text-ctp-subtext0">
            Deleted on {{ new Date(signalsStore.arc.deletedAt).toLocaleDateString(undefined, { dateStyle: 'medium' }) }}
          </span>
          <span v-if="availableUntil" class="text-xs text-ctp-subtext0">Available until {{ availableUntil }}</span>
        </div>
        <div v-if="signalsStore.arc.labels.length > 0" class="mt-2 flex flex-wrap gap-1">
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

      <!-- Retention warning -->
      <div v-if="availableUntil" class="mb-4 rounded-lg border border-ctp-peach/30 bg-ctp-peach/10 px-4 py-2 text-xs text-ctp-peach">
        ⚠ This thread will be automatically deleted on {{ availableUntil }}
      </div>

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
          <SignalRenderer v-else :signal="group.signal" :duplicates="group.duplicates" :linked-signal="group.linkedSignal" @undo="onSignalUndo" @reply="startDraft" />
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

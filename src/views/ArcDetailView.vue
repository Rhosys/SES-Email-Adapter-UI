<script setup lang="ts">
import { onMounted, onUnmounted, computed } from 'vue'
import { useRoute, RouterLink } from 'vue-router'
import { useSignalsStore } from '@/stores/signals'
import { useAccountStore } from '@/stores/account'
import { useToast } from '@/composables/useToast'
import { api } from '@/lib/api'
import WorkflowPanel from '@/components/WorkflowPanel.vue'
import SignalCard from '@/components/SignalCard.vue'
import DraftSignalCard from '@/components/DraftSignalCard.vue'
import ReplyComposer from '@/components/ReplyComposer.vue'

const route = useRoute()
const signalsStore = useSignalsStore()
const accountStore = useAccountStore()
const { showUndo } = useToast()

const arcId = computed(() => route.params.id as string)

const showReply = computed(() => {
  const workflow = signalsStore.arc?.workflow
  return workflow !== 'auth' && workflow !== 'test' && workflow !== 'status'
})

onMounted(async () => {
  signalsStore.reset()
  await accountStore.fetchAccount()
  await signalsStore.fetchAll(arcId.value)
})

onUnmounted(() => {
  signalsStore.reset()
})

async function startDraft() {
  await signalsStore.createDraft(arcId.value)
}

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
  const ok = await signalsStore.archiveArc(arcId.value)
  if (!ok) return
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

async function loadMore() {
  await signalsStore.fetchMore(arcId.value)
}
</script>

<template>
  <div class="mx-auto max-w-3xl px-4 py-6">
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
          <h1 class="text-xl font-semibold text-ctp-text">{{ signalsStore.arc.summary }}</h1>
          <div class="flex shrink-0 items-center gap-2">
            <button
              v-if="showReply"
              class="flex h-8 items-center gap-1.5 rounded border border-ctp-surface1 px-3 text-sm text-ctp-subtext1 transition-colors hover:border-ctp-mauve hover:text-ctp-mauve"
              @click="startDraft"
            >
              <svg class="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <path d="M6 3.5L1 8l5 4.5V9.5c4.5 0 7.5 1.5 9 4.5-.5-4.5-3-8-9-8V3.5z"/>
              </svg>
              Reply
            </button>
            <button
              v-if="signalsStore.arc.status === 'active'"
              class="flex h-8 items-center gap-1.5 rounded border border-ctp-surface1 px-3 text-sm text-ctp-subtext1 transition-colors hover:border-ctp-red hover:text-ctp-red"
              @click="archive"
            >
              <svg class="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <path d="M1.5 2h13l-1 2H2.5L1.5 2zm.5 3h12v9a1 1 0 01-1 1H3a1 1 0 01-1-1V5zm4 2v5h5V7H6z"/>
              </svg>
              Archive
            </button>
          </div>
        </div>
        <div class="mt-1 flex flex-wrap items-center gap-2 text-xs text-ctp-subtext0">
          <span class="capitalize">{{ signalsStore.arc.workflow }}</span>
          <span>·</span>
          <span class="capitalize">{{ signalsStore.arc.status }}</span>
          <span v-if="signalsStore.arc.urgency" class="capitalize"
            >· {{ signalsStore.arc.urgency }}</span
          >
        </div>
        <div class="mt-2 flex flex-wrap gap-1">
          <span
            v-for="label in signalsStore.arc.labels"
            :key="label"
            class="rounded-full bg-ctp-surface1 px-2 py-0.5 text-xs text-ctp-subtext1"
          >
            {{ label }}
          </span>
        </div>
      </div>

      <!-- Workflow panel (from latest signal with workflowData) -->
      <div v-if="signalsStore.latestSignal?.workflowData" class="mb-6">
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
        <template v-for="signal in signalsStore.items" :key="signal.id">
          <DraftSignalCard
            v-if="signal.status === 'draft'"
            :signal="signal"
            @discard="onDraftDiscard"
            @sent="onDraftSent"
          />
          <SignalCard v-else :signal="signal" @undo="onSignalUndo" />
        </template>
      </div>

      <!-- Reply composer (opened from header Reply button) -->
      <div v-if="showReply" class="mt-6">
        <ReplyComposer @reply="startDraft" />
      </div>
    </template>
  </div>
</template>

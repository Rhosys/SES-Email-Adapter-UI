<script setup lang="ts">
import { onMounted, onUnmounted, computed } from 'vue'
import { useRoute, RouterLink } from 'vue-router'
import { useSignalsStore } from '@/stores/signals'
import { useAccountStore } from '@/stores/account'
import WorkflowPanel from '@/components/WorkflowPanel.vue'
import SignalCard from '@/components/SignalCard.vue'
import ReplyComposer from '@/components/ReplyComposer.vue'

const route = useRoute()
const signalsStore = useSignalsStore()
const accountStore = useAccountStore()

const arcId = computed(() => route.params.id as string)

const showReply = computed(() => {
  const workflow = signalsStore.arc?.workflow
  return workflow !== 'auth' && workflow !== 'test' && workflow !== 'status'
})

onMounted(async () => {
  signalsStore.reset()
  const accountId = accountStore.accountId
  if (!accountId) {
    await accountStore.fetchAccount()
  }
  const id = accountStore.accountId
  if (id) {
    await signalsStore.fetchAll(id, arcId.value)
  }
})

onUnmounted(() => {
  signalsStore.reset()
})

async function archive() {
  const id = accountStore.accountId
  if (!id) return
  await signalsStore.archiveArc(id, arcId.value)
}

async function loadMore() {
  const id = accountStore.accountId
  if (!id) return
  await signalsStore.fetchMore(id, arcId.value)
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
    <div v-if="signalsStore.loading" class="py-12 text-center text-sm text-ctp-subtext0">
      Loading…
    </div>

    <!-- Error -->
    <div
      v-else-if="signalsStore.error"
      class="rounded-lg border border-ctp-red bg-ctp-red/10 px-4 py-3 text-sm text-ctp-red"
    >
      {{ signalsStore.error }}
    </div>

    <template v-else-if="signalsStore.arc">
      <!-- Arc header -->
      <div class="mb-6">
        <h1 class="text-xl font-semibold text-ctp-text">{{ signalsStore.arc.summary }}</h1>
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

      <!-- Signal thread -->
      <div class="space-y-4">
        <SignalCard v-for="signal in signalsStore.items" :key="signal.id" :signal="signal" />
      </div>

      <!-- Reply composer -->
      <div v-if="showReply && signalsStore.latestSignal" class="mt-6">
        <ReplyComposer :signal="signalsStore.latestSignal" />
      </div>

      <!-- Archive action -->
      <div v-if="signalsStore.arc.status === 'active'" class="mt-6 flex justify-end">
        <button
          class="rounded border border-ctp-surface1 px-4 py-2 text-sm text-ctp-subtext0 transition-colors hover:bg-ctp-surface1 hover:text-ctp-text"
          @click="archive"
        >
          Archive
        </button>
      </div>
    </template>
  </div>
</template>

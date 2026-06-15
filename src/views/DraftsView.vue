<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAccountStore } from '@/stores/account'
import { api } from '@/lib/api'
import type { Signal } from '@/types/server'
import { isEmailSignal } from '@/lib/signal-guards'

const router = useRouter()
const accountStore = useAccountStore()

const drafts = ref<Signal[]>([])
const loading = ref(true)

onMounted(async () => {
  if (!accountStore.accountId) return
  loading.value = true
  const arcsResult = await api.listArcs(accountStore.accountId, { limit: 100 })
  if (arcsResult.isOk()) {
    const allDrafts: Signal[] = []
    for (const arc of arcsResult.value.arcs) {
      const sigResult = await api.listSignals(accountStore.accountId!, arc.arcId, { limit: 50 })
      if (sigResult.isOk()) {
        allDrafts.push(...sigResult.value.signals.filter((s) => s.status === 'draft'))
      }
    }
    drafts.value = allDrafts
  }
  loading.value = false
})

function openDraft(signal: Signal) {
  if (signal.arcId) {
    void router.push({ name: 'arc-detail', params: { id: signal.arcId } })
  }
}
</script>

<template>
  <div>
    <header class="border-b border-ctp-surface0 bg-ctp-mantle px-4 py-3">
      <h1 class="text-lg font-semibold">Drafts</h1>
    </header>

    <main class="mx-auto max-w-3xl px-4 py-6">
      <div v-if="loading" role="status" aria-label="Loading drafts…" class="animate-pulse space-y-3">
        <div v-for="i in 3" :key="i" class="rounded-lg border border-ctp-surface0 p-4">
          <div class="h-4 w-2/3 rounded bg-ctp-surface1" />
          <div class="mt-2 h-3 w-1/3 rounded bg-ctp-surface1" />
        </div>
      </div>

      <div v-else-if="drafts.length === 0" class="py-20 text-center">
        <p class="text-base font-medium text-ctp-text">No drafts</p>
        <p class="mx-auto mt-2 max-w-sm text-sm text-ctp-subtext0">
          When you start composing a reply but don't send it, it'll appear here.
        </p>
      </div>

      <div v-else class="space-y-2">
        <button
          v-for="draft in drafts"
          :key="draft.signalId"
          type="button"
          class="flex w-full items-start gap-3 rounded-lg border border-ctp-surface1 bg-ctp-mantle p-4 text-left transition-colors hover:border-ctp-mauve/50"
          @click="openDraft(draft)"
        >
          <div class="min-w-0 flex-1">
            <p class="text-sm font-medium text-ctp-text">
              {{ isEmailSignal(draft) ? draft.data.subject || '(No subject)' : 'Draft' }}
            </p>
            <p v-if="isEmailSignal(draft)" class="mt-0.5 text-xs text-ctp-subtext0">
              To: {{ draft.data.to.map((a) => a.name ?? a.address).join(', ') || '(No recipients)' }}
            </p>
          </div>
          <span class="shrink-0 text-xs text-ctp-subtext0">
            {{ new Date(draft.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) }}
          </span>
        </button>
      </div>
    </main>
  </div>
</template>

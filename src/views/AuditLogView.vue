<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useAccountStore } from '@/stores/account'
import { api } from '@/lib/api'
import type { AuditEvent } from '@/types/server'

const accountStore = useAccountStore()
const events = ref<AuditEvent[]>([])
const loading = ref(false)
const loadingMore = ref(false)
const error = ref<string | null>(null)
const nextCursor = ref<string | undefined>()

const EVENT_ICONS: Record<string, string> = {
  'signal.allowed': '✅',
  'signal.blocked': '🚫',
  'signal.quarantined': '🔒',
  'rule.created': '📋',
  'rule.updated': '✏️',
  'rule.deleted': '🗑️',
  'label.created': '🏷️',
  'label.updated': '✏️',
  'label.deleted': '🗑️',
  'user.invited': '👤',
  'user.role_changed': '🔑',
  'user.removed': '👤',
  'account.updated': '⚙️',
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString()
}

async function load(cursor?: string) {
  if (!accountStore.accountId) return
  if (cursor) loadingMore.value = true
  else loading.value = true
  error.value = null
  const result = await api.listAuditEvents(accountStore.accountId, { cursor, limit: 50 })
  loading.value = false
  loadingMore.value = false
  if (result.isErr()) {
    error.value = result.error.message
    return
  }
  if (cursor) {
    events.value = [...events.value, ...result.value.items]
  } else {
    events.value = result.value.items
  }
  nextCursor.value = result.value.nextCursor
}

onMounted(async () => {
  if (!accountStore.accountId) await accountStore.fetchAccount()
  await load()
})
</script>

<template>
  <div>
    <header class="border-b border-ctp-surface0 bg-ctp-mantle px-4 py-3">
      <h1 class="text-lg font-semibold">Audit log</h1>
      <p class="mt-0.5 text-xs text-ctp-subtext0">All account activity, newest first</p>
    </header>

    <main class="mx-auto max-w-3xl px-4 py-6">
      <div
        v-if="error"
        class="mb-4 rounded-lg border border-ctp-red bg-ctp-red/10 px-4 py-3 text-sm text-ctp-red"
      >
        {{ error }}
      </div>

      <div v-if="loading" class="py-20 text-center text-sm text-ctp-subtext0">Loading…</div>

      <div v-else-if="events.length === 0" class="py-20 text-center text-sm text-ctp-subtext0">
        No audit events found
      </div>

      <div v-else class="divide-y divide-ctp-surface0 rounded-lg border border-ctp-surface0">
        <div v-for="event in events" :key="event.id" class="flex gap-3 px-4 py-3">
          <span class="mt-0.5 shrink-0 text-base">{{ EVENT_ICONS[event.type] ?? '📝' }}</span>
          <div class="min-w-0 flex-1">
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0 overflow-hidden">
                <span class="truncate font-mono text-xs text-ctp-subtext0">{{ event.type }}</span>
                <span
                  v-if="event.resourceId"
                  class="ml-2 truncate font-mono text-xs text-ctp-subtext0"
                >
                  {{ event.resourceId }}
                </span>
              </div>
              <span class="shrink-0 text-xs text-ctp-subtext0">{{
                formatDate(event.createdAt)
              }}</span>
            </div>
            <p class="mt-0.5 truncate text-xs text-ctp-subtext0">
              {{ event.actorEmail ?? event.actorId }}
            </p>
          </div>
        </div>
      </div>

      <div v-if="nextCursor" class="mt-4 flex justify-center">
        <button
          :disabled="loadingMore"
          class="rounded bg-ctp-surface0 px-4 py-2 text-sm text-ctp-text hover:bg-ctp-surface1 disabled:opacity-50"
          @click="load(nextCursor)"
        >
          {{ loadingMore ? 'Loading…' : 'Load more' }}
        </button>
      </div>
    </main>
  </div>
</template>

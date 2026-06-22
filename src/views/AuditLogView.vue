<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAccountStore } from '@/stores/account'
import { api } from '@/lib/api'
import type { AuditEvent } from '@/types/server'

const route = useRoute()
const router = useRouter()
const accountStore = useAccountStore()
const events = ref<AuditEvent[]>([])
const loading = ref(false)
const loadingMore = ref(false)
const error = ref<string | null>(null)
const nextCursor = ref<string | undefined>()
const expandedIds = ref<Set<string>>(new Set())

const RESOURCE_ICONS: Record<string, string> = {
  rule: '📋',
  alias: '📧',
  domain: '🌐',
  account: '⚙️',
  label: '🏷️',
  view: '👁️',
  template: '📄',
  forwarding_address: '↗️',
}

interface DiffEntry {
  key: string
  before: unknown
  after: unknown
  status: 'added' | 'removed' | 'changed' | 'unchanged'
}

function toRecord(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {}
}

function diffEntries(before: unknown, after: unknown): DiffEntry[] {
  const b = toRecord(before)
  const a = toRecord(after)
  const keys = new Set([...Object.keys(b), ...Object.keys(a)])
  return [...keys]
    .map((key) => {
      const inBefore = key in b
      const inAfter = key in a
      let status: DiffEntry['status']
      if (!inBefore) status = 'added'
      else if (!inAfter) status = 'removed'
      else if (JSON.stringify(b[key]) !== JSON.stringify(a[key])) status = 'changed'
      else status = 'unchanged'
      return { key, before: b[key], after: a[key], status }
    })
    .sort((x, y) => {
      const order = { changed: 0, added: 0, removed: 0, unchanged: 1 }
      return order[x.status] - order[y.status]
    })
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString()
}

function formatValue(v: unknown): string {
  if (v === undefined || v === null) return '—'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

function hasDiff(event: AuditEvent) {
  return event.before !== undefined || event.after !== undefined
}

function toggleExpand(id: string) {
  const next = new Set(expandedIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expandedIds.value = next
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
    events.value = [...events.value, ...result.value.events]
  } else {
    events.value = result.value.events
  }
  nextCursor.value = result.value.pagination.cursor ?? undefined
  void router.replace({ query: cursor ? { cursor } : {} })
}

onMounted(async () => {
  const cursor = route.query.cursor as string | undefined
  await load(cursor)
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

      <div
        v-if="loading"
        role="status"
        aria-label="Loading audit log…"
        class="animate-pulse divide-y divide-ctp-surface0 rounded-lg border border-ctp-surface0"
      >
        <div v-for="i in 6" :key="i" class="flex items-start gap-3 px-4 py-3">
          <div class="mt-0.5 h-3 w-20 shrink-0 rounded bg-ctp-surface1" />
          <div class="flex-1 space-y-1.5">
            <div class="h-4 rounded bg-ctp-surface1" :style="{ width: `${40 + (i * 13) % 45}%` }" />
            <div class="h-3 w-28 rounded bg-ctp-surface1" />
          </div>
          <div class="h-5 w-16 shrink-0 rounded-full bg-ctp-surface1" />
        </div>
      </div>

      <div v-else-if="events.length === 0" class="py-20 text-center text-sm text-ctp-subtext0">
        <p class="font-medium text-ctp-text">No activity yet</p>
        <p class="mx-auto mt-1 max-w-xs">
          Audit events are recorded whenever a rule, alias, domain, label, or account setting is
          created, updated, or deleted. Changes will appear here as they happen.
        </p>
      </div>

      <template v-else>
        <div
          v-if="events.some((e) => hasDiff(e))"
          class="mb-2 flex flex-wrap items-center gap-3 text-xs text-ctp-subtext0"
        >
          <span>Diff:</span>
          <span class="flex items-center gap-1">
            <span class="h-2 w-2 rounded-sm bg-ctp-green/30 ring-1 ring-ctp-green/50" />
            Added / new value
          </span>
          <span class="flex items-center gap-1">
            <span class="h-2 w-2 rounded-sm bg-ctp-red/30 ring-1 ring-ctp-red/50" />
            Removed / old value
          </span>
        </div>

      <div class="divide-y divide-ctp-surface0 rounded-lg border border-ctp-surface0">
        <div v-for="event in events" :key="event.id">
          <!-- Row -->
          <button
            class="flex w-full gap-3 px-4 py-3 text-left transition-colors"
            :class="hasDiff(event) ? 'cursor-pointer hover:bg-ctp-surface0/40' : 'cursor-default'"
            :aria-expanded="hasDiff(event) ? expandedIds.has(event.id) : undefined"
            @click="hasDiff(event) && toggleExpand(event.id)"
          >
            <span class="mt-0.5 shrink-0 text-base" aria-hidden="true">
              {{ RESOURCE_ICONS[event.resourceType] ?? '📝' }}
            </span>
            <div class="min-w-0 flex-1">
              <div class="flex items-start justify-between gap-2">
                <div class="flex min-w-0 items-center gap-1.5">
                  <span class="text-xs font-medium text-ctp-text">{{ event.resourceType }}</span>
                  <span
                    class="rounded px-1 py-0.5 font-mono text-xs"
                    :class="{
                      'bg-ctp-green/15 text-ctp-green': event.action === 'created',
                      'bg-ctp-red/15 text-ctp-red': event.action === 'deleted',
                      'bg-ctp-yellow/15 text-ctp-yellow': event.action === 'updated',
                      'bg-ctp-blue/15 text-ctp-blue': event.action === 'reordered',
                    }"
                  >
                    {{ event.action }}
                  </span>
                  <span
                    v-if="event.resourceId"
                    class="truncate font-mono text-xs text-ctp-subtext0"
                  >
                    {{ event.resourceId }}
                  </span>
                </div>
                <div class="flex shrink-0 items-center gap-1.5">
                  <span v-if="hasDiff(event)" class="text-xs text-ctp-subtext0">
                    {{ expandedIds.has(event.id) ? '▲' : '▼' }}
                  </span>
                  <span class="text-xs text-ctp-subtext0">{{ formatDate(event.timestamp) }}</span>
                </div>
              </div>
              <p class="mt-0.5 truncate text-xs text-ctp-subtext0">
                {{ event.actorEmail ?? event.userId }}
              </p>
            </div>
          </button>

          <!-- Expanded diff -->
          <div
            v-if="expandedIds.has(event.id) && hasDiff(event)"
            class="border-t border-ctp-surface0 bg-ctp-base px-4 py-3"
          >
            <!-- updated: side-by-side before / after diff -->
            <template
              v-if="
                event.action === 'updated' &&
                event.before !== undefined &&
                event.after !== undefined
              "
            >
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <p class="mb-1.5 text-xs font-medium uppercase tracking-wide text-ctp-subtext0">
                    Before
                  </p>
                  <div class="space-y-1">
                    <div
                      v-for="entry in diffEntries(event.before, event.after)"
                      :key="entry.key"
                      class="flex gap-2 rounded px-2 py-1 font-mono text-xs"
                      :class="{
                        'bg-ctp-red/10':
                          entry.status === 'changed' || entry.status === 'removed',
                        'opacity-40': entry.status === 'unchanged',
                      }"
                    >
                      <span class="shrink-0 text-ctp-subtext0">{{ entry.key }}:</span>
                      <span
                        v-if="entry.status !== 'added'"
                        class="truncate"
                        :class="
                          entry.status === 'changed' || entry.status === 'removed'
                            ? 'text-ctp-red'
                            : 'text-ctp-text'
                        "
                      >
                        {{ formatValue(entry.before) }}
                      </span>
                      <span v-else class="text-ctp-surface1">—</span>
                    </div>
                  </div>
                </div>
                <div>
                  <p class="mb-1.5 text-xs font-medium uppercase tracking-wide text-ctp-subtext0">
                    After
                  </p>
                  <div class="space-y-1">
                    <div
                      v-for="entry in diffEntries(event.before, event.after)"
                      :key="entry.key"
                      class="flex gap-2 rounded px-2 py-1 font-mono text-xs"
                      :class="{
                        'bg-ctp-green/10':
                          entry.status === 'changed' || entry.status === 'added',
                        'opacity-40': entry.status === 'unchanged',
                      }"
                    >
                      <span class="shrink-0 text-ctp-subtext0">{{ entry.key }}:</span>
                      <span
                        v-if="entry.status !== 'removed'"
                        class="truncate"
                        :class="
                          entry.status === 'changed' || entry.status === 'added'
                            ? 'text-ctp-green'
                            : 'text-ctp-text'
                        "
                      >
                        {{ formatValue(entry.after) }}
                      </span>
                      <span v-else class="text-ctp-surface1">—</span>
                    </div>
                  </div>
                </div>
              </div>
            </template>

            <!-- created / reordered: show after snapshot -->
            <template v-else-if="event.after !== undefined">
              <p class="mb-1.5 text-xs font-medium uppercase tracking-wide text-ctp-subtext0">
                Snapshot
              </p>
              <div class="space-y-1">
                <div
                  v-for="[key, val] in Object.entries(toRecord(event.after))"
                  :key="key"
                  class="flex gap-2 rounded bg-ctp-green/10 px-2 py-1 font-mono text-xs"
                >
                  <span class="shrink-0 text-ctp-subtext0">{{ key }}:</span>
                  <span class="truncate text-ctp-text">{{ formatValue(val) }}</span>
                </div>
              </div>
            </template>

            <!-- deleted: show before snapshot -->
            <template v-else-if="event.before !== undefined">
              <p class="mb-1.5 text-xs font-medium uppercase tracking-wide text-ctp-subtext0">
                Deleted record
              </p>
              <div class="space-y-1">
                <div
                  v-for="[key, val] in Object.entries(toRecord(event.before))"
                  :key="key"
                  class="flex gap-2 rounded bg-ctp-red/10 px-2 py-1 font-mono text-xs"
                >
                  <span class="shrink-0 text-ctp-subtext0">{{ key }}:</span>
                  <span class="truncate text-ctp-text">{{ formatValue(val) }}</span>
                </div>
              </div>
            </template>
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
      </template>
    </main>
  </div>
</template>

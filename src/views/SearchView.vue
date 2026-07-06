<script setup lang="ts">
import { inject, watch, onMounted, ref } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import { useSearch } from '@/composables/useSearch'
import { useLabelsStore } from '@/stores/labels'
import { visibleLabels, findLabelMeta } from '@/lib/labels'
import { formatRelativeTime } from '@/composables/useFormattedTime'
import { NOW_KEY } from '@/composables/useRelativeTime'
import ActionBadge from '@/components/ActionBadge.vue'

const now = inject(NOW_KEY)

const route = useRoute()
const router = useRouter()
const labelsStore = useLabelsStore()

function labelMeta(label: string) {
  return findLabelMeta(labelsStore.items, label)
}

const { query, results, loading, searched, error, onPaste } = useSearch({ mode: 'full' })

// Initialize query from route on mount
if (route.query.q) {
  query.value = route.query.q as string
}

// Sync query changes back to the route
watch(query, (q) => {
  const trimmed = q.trim()
  const currentRouteQ = (route.query.q as string) ?? ''
  if (trimmed !== currentRouteQ) {
    void router.replace({ path: '/search', query: trimmed ? { q: trimmed } : undefined })
  }
})

function relTime(iso: string): string {
  return now ? formatRelativeTime(iso, now.value) : ''
}

const queryInput = ref<HTMLInputElement | null>(null)

onMounted(() => {
  queryInput.value?.focus()
})
</script>

<template>
  <div>
    <header class="hidden border-b border-ctp-surface0 bg-ctp-mantle px-4 py-3 sm:block">
      <h1 class="text-lg font-semibold">Search</h1>
    </header>

    <main class="mx-auto max-w-3xl px-4 py-6">
      <!-- Search input -->
      <div class="mb-6">
        <input
          ref="queryInput"
          v-model="query"
          type="search"
          maxlength="64"
          aria-label="Search threads, aliases, rules, templates"
          placeholder="Search threads, aliases, rules, templates…"
          class="w-full rounded-lg border border-ctp-surface1 bg-ctp-mantle px-4 py-2 text-sm text-ctp-text placeholder:text-ctp-subtext0 focus:border-ctp-mauve focus:outline-none"
          @paste="onPaste"
        />
      </div>

      <!-- Loading -->
      <div v-if="loading" class="py-8 text-center text-sm text-ctp-subtext0">
        Searching…
      </div>

      <!-- Error -->
      <div
        v-if="error"
        class="mb-4 rounded-lg border border-ctp-red bg-ctp-red/10 px-4 py-3 text-sm text-ctp-red"
      >
        {{ error }}
      </div>

      <!-- No results -->
      <div
        v-if="searched && !loading && results.threads.length === 0 && results.aliases.length === 0 && results.rules.length === 0 && results.templates.length === 0"
        class="py-16 text-center text-sm text-ctp-subtext0"
      >
        <p class="font-medium text-ctp-text">No results for "{{ query }}"</p>
        <p class="mt-1">
          Try a sender address, part of a subject line, or a rule name — search checks across all
          of them.
        </p>
      </div>

      <!-- Threads section -->
      <section v-if="results.threads.length > 0" class="mb-6">
        <h2 class="mb-2 text-xs font-semibold uppercase tracking-wide text-ctp-subtext0">
          Threads ({{ results.threads.length }})
        </h2>
        <div class="divide-y divide-ctp-surface0 rounded-lg border border-ctp-surface0">
          <RouterLink
            v-for="thread in results.threads"
            :key="thread.threadId"
            :to="`/threads/${thread.threadId}`"
            class="block px-4 py-3 transition-colors hover:bg-ctp-surface0/50"
          >
            <div class="flex items-start justify-between gap-2">
              <p class="min-w-0 flex-1 truncate text-sm font-medium text-ctp-text">{{ thread.subject || thread.summary }}</p>
              <span class="shrink-0 text-xs text-ctp-subtext0">
                {{ relTime(thread.lastSignalAt) }}
              </span>
            </div>
            <div class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ctp-subtext0">
              <span v-if="thread.senderAddress">From: {{ thread.senderAddress }}</span>
              <span v-if="thread.recipientAddress">To: {{ thread.recipientAddress }}</span>
              <span>{{ thread.workflow }}</span>
            </div>
            <div v-if="visibleLabels(thread.labels).length" class="mt-1 flex flex-wrap gap-1">
              <span
                v-for="label in visibleLabels(thread.labels)"
                :key="label"
                class="flex items-center gap-1 rounded bg-ctp-surface1 px-1.5 py-0.5 text-xs text-ctp-subtext0"
              >
                <span
                  v-if="labelMeta(label)"
                  class="h-2 w-2 shrink-0 rounded-full"
                  :style="{ backgroundColor: labelMeta(label)!.color }"
                />
                {{ labelMeta(label)?.name ?? label }}
              </span>
            </div>
          </RouterLink>
        </div>
      </section>

      <!-- Aliases section -->
      <section v-if="results.aliases.length > 0" class="mb-6">
        <h2 class="mb-2 text-xs font-semibold uppercase tracking-wide text-ctp-subtext0">
          Email addresses ({{ results.aliases.length }})
        </h2>
        <div class="divide-y divide-ctp-surface0 rounded-lg border border-ctp-surface0">
          <RouterLink
            v-for="alias in results.aliases"
            :key="alias.alias"
            to="/settings"
            class="flex items-center justify-between px-4 py-3 transition-colors hover:bg-ctp-surface0/50"
          >
            <p class="text-sm text-ctp-text">{{ alias.alias }}</p>
            <span class="text-xs text-ctp-subtext0">{{ alias.unknownSenderPolicy }}</span>
          </RouterLink>
        </div>
      </section>

      <!-- Rules section -->
      <section v-if="results.rules.length > 0" class="mb-6">
        <h2 class="mb-2 text-xs font-semibold uppercase tracking-wide text-ctp-subtext0">
          Rules ({{ results.rules.length }})
        </h2>
        <div class="divide-y divide-ctp-surface0 rounded-lg border border-ctp-surface0">
          <RouterLink
            v-for="rule in results.rules"
            :key="rule.ruleId"
            :to="`/rules/${rule.ruleId}`"
            class="block px-4 py-3 transition-colors hover:bg-ctp-surface0/50"
          >
            <div class="flex flex-wrap items-center gap-1.5">
              <p class="text-sm font-medium text-ctp-text">{{ rule.name }}</p>
              <ActionBadge v-for="act in rule.actions" :key="act.type" :type="act.type" />
            </div>
          </RouterLink>
        </div>
      </section>

      <!-- Templates section -->
      <section v-if="results.templates.length > 0" class="mb-6">
        <h2 class="mb-2 text-xs font-semibold uppercase tracking-wide text-ctp-subtext0">
          Templates ({{ results.templates.length }})
        </h2>
        <div class="divide-y divide-ctp-surface0 rounded-lg border border-ctp-surface0">
          <RouterLink
            v-for="tpl in results.templates"
            :key="tpl.templateId"
            to="/templates"
            class="block px-4 py-3 transition-colors hover:bg-ctp-surface0/50"
          >
            <div class="flex items-center justify-between gap-2">
              <p class="text-sm font-medium text-ctp-text">{{ tpl.name }}</p>
              <span class="shrink-0 text-xs text-ctp-subtext0">
                {{ relTime(tpl.updatedAt) }}
              </span>
            </div>
            <p class="mt-0.5 text-xs text-ctp-subtext0">{{ tpl.subject }}</p>
          </RouterLink>
        </div>
      </section>
    </main>
  </div>
</template>

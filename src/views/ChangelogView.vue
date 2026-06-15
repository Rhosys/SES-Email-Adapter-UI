<script setup lang="ts">
const ENTRIES = [
  {
    version: '0.1.0',
    date: '2025-05-15',
    changes: [
      'Inbox with status tabs (active / archived / all), bulk select, bulk archive and label',
      'Arc detail with threaded signal list, workflow panels, and reply composer',
      'Quarantine — review held signals, allow or reject, create rules from held signals',
      'Rules engine — visual condition builder with AND/OR groups, 14 action types',
      'Labels and custom sidebar views with drag-to-reorder',
      'Search across threads, aliases, and rules',
      'Settings — email addresses, domains, DNS verification, forwarding, team, notifications',
      'User profile — linked identities, passkeys, active sessions',
      'Onboarding wizard — domain setup, DNS records, filter mode selection',
      'Audit log with event history',
      'Support panel with knowledge base and contact form',
    ],
  },
]
</script>

<template>
  <div>
    <header class="border-b border-ctp-surface0 bg-ctp-mantle px-4 py-3">
      <h1 class="text-lg font-semibold">Changelog</h1>
      <p class="mt-0.5 text-xs text-ctp-subtext0">What's new in recent releases</p>
    </header>

    <main class="mx-auto max-w-2xl px-4 py-6">
      <div v-for="entry in ENTRIES" :key="entry.version" class="mb-8">
        <div class="mb-3 flex items-baseline gap-3">
          <h2 class="text-sm font-semibold text-ctp-text">v{{ entry.version }}</h2>
          <span class="text-xs text-ctp-subtext0">{{ entry.date }}</span>
        </div>
        <ul class="space-y-1.5">
          <li
            v-for="change in entry.changes"
            :key="change"
            class="flex items-start gap-2 text-sm text-ctp-subtext1"
          >
            <span class="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-ctp-mauve" />
            {{ change }}
          </li>
        </ul>
      </div>
    </main>
  </div>
</template>

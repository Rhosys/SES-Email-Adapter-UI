<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRoute } from 'vue-router'
import { useAccountStore } from '@/stores/account'
import { loginClient } from '@/lib/auth'
import { api } from '@/lib/api'
import buildInfo from '@/lib/buildInfo'

const route = useRoute()
const accountStore = useAccountStore()

const form = ref({ category: '', subject: '', description: '' })
const submitting = ref(false)
const submitted = ref(false)
const submitError = ref<string | null>(null)

const userId = ref<string | null>(null)
try {
  const identity = loginClient.getUserIdentity() as { sub?: string } | null
  userId.value = identity?.sub ?? null
} catch {
  // best-effort
}

const statusUrl = computed(() => `https://status.${buildInfo.deployment.fdqn}`)

const CATEGORIES = [
  'Bug report',
  'Feature request',
  'General question',
  'Billing',
  'Account access',
]

const ARTICLES = [
  {
    title: 'Inbox and thread lifecycle',
    excerpt:
      'Threads group related emails together. New signals arrive in your inbox; archive to dismiss, or let rules handle them automatically.',
    tags: ['inbox', 'thread', 'archive', 'signal'],
  },
  {
    title: 'Setting up rules',
    excerpt:
      'Rules match signals by sender, subject, domain, or spam score and apply actions like block, quarantine, label, or forward.',
    tags: ['rules', 'conditions', 'actions', 'block', 'quarantine'],
  },
  {
    title: 'Reviewing quarantined emails',
    excerpt:
      'Quarantined signals are held for manual review. Allow to deliver, block to discard, or create a rule to handle similar signals automatically.',
    tags: ['quarantine', 'allow', 'block', 'untrusted', 'sender'],
  },
  {
    title: 'Labels and saved views',
    excerpt:
      'Labels tag threads for organisation. Saved views are reusable filters — by label, workflow, sender, or status — accessible from the sidebar.',
    tags: ['labels', 'views', 'filters', 'sidebar'],
  },
  {
    title: 'Email aliases and filter modes',
    excerpt:
      'Each alias has a filter mode: strict (approved senders only), sender match, notify new, or allow all. Manage aliases in Settings → Email addresses.',
    tags: ['aliases', 'filter', 'settings', 'sender', 'strict'],
  },
  {
    title: 'Domain setup and DNS verification',
    excerpt:
      'Add your domain in Settings → Domains, then publish the shown DNS records. Use Re-check to trigger an on-demand verification after updating DNS.',
    tags: ['domain', 'dns', 'settings', 'verification', 'mx', 'spf', 'dkim'],
  },
  {
    title: 'Team members and roles',
    excerpt:
      'Invite team members from Settings → Team. Assign roles to control access. Pending invites appear until the invitation is accepted.',
    tags: ['team', 'invite', 'roles', 'settings', 'permissions'],
  },
  {
    title: 'Search',
    excerpt:
      'Use the search bar to find threads, senders, aliases, or rules. The sidebar shows a quick preview; the full search page shows all results.',
    tags: ['search', 'threads', 'aliases', 'rules', 'find'],
  },
]

const relevantArticles = computed(() => {
  const q = form.value.description.trim().toLowerCase()
  if (!q) return ARTICLES.slice(0, 5)

  const scored = ARTICLES.map((article) => {
    let score = 0
    const words = q.split(/\s+/).filter((w) => w.length > 2)
    for (const word of words) {
      if (article.title.toLowerCase().includes(word)) score += 3
      if (article.excerpt.toLowerCase().includes(word)) score += 2
      if (article.tags.some((t) => t.includes(word))) score += 2
    }
    return { article, score }
  })

  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, 5).map((s) => s.article)
})

const canSubmit = computed(
  () =>
    form.value.category &&
    form.value.subject.trim() &&
    form.value.description.trim() &&
    !submitting.value,
)

function buildContext(): string {
  const lines = [
    `Account: ${accountStore.accountId ?? 'unknown'}`,
    `User: ${userId.value ?? 'unknown'}`,
    `Route: ${route.fullPath}`,
    `Browser: ${navigator.userAgent}`,
  ]
  return lines.join('\n')
}

async function submitForm() {
  submitting.value = true
  submitError.value = null

  const context = buildContext()
  const body = {
    category: form.value.category,
    subject: form.value.subject.trim(),
    description: form.value.description.trim(),
    context,
  }

  const accountId = accountStore.accountId
  if (!accountId) {
    submitError.value = 'No account selected'
    submitting.value = false
    return
  }

  const result = await api.createSupportTicket(accountId, body)

  if (result.isOk()) {
    submitted.value = true
    submitting.value = false
    return
  }

  // Fallback: if 404 (endpoint not implemented yet), open mailto
  if (result.error.status === 404) {
    console.error('[support] POST /support-tickets returned 404 — endpoint not implemented. Falling back to mailto.')
    const subject = `[${form.value.category}] ${form.value.subject.trim()}`
    const mailBody = `${form.value.description.trim()}\n\n---\n${context}`
    window.open(
      `mailto:support@${buildInfo.deployment.fdqn}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(mailBody)}`,
    )
    submitted.value = true
  } else {
    submitError.value = result.error.message
  }

  submitting.value = false
}

function resetForm() {
  form.value = { category: '', subject: '', description: '' }
  submitted.value = false
  submitError.value = null
}
</script>

<template>
  <div class="mx-auto max-w-2xl px-4 py-8 sm:px-6">
    <h1 class="text-xl font-semibold text-ctp-text">Help & Support</h1>
    <p class="mt-1 text-sm text-ctp-subtext1">Report an issue or check system status.</p>

    <!-- Status -->
    <section class="mt-6">
      <a
        :href="statusUrl"
        target="_blank"
        rel="noopener noreferrer"
        class="flex items-center justify-between rounded-lg border border-ctp-surface0 bg-ctp-base p-4 transition-colors hover:bg-ctp-surface0"
      >
        <div>
          <p class="text-sm font-medium text-ctp-text">Service status</p>
          <p class="mt-0.5 text-xs text-ctp-subtext1">Check for incidents and outages</p>
        </div>
        <svg
          class="h-4 w-4 shrink-0 text-ctp-subtext0"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          aria-hidden="true"
        >
          <path d="M6 3l5 5-5 5" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </a>

      <router-link
        to="/changelog"
        class="mt-2 flex items-center justify-between rounded-lg border border-ctp-surface0 bg-ctp-base p-4 transition-colors hover:bg-ctp-surface0"
      >
        <div>
          <p class="text-sm font-medium text-ctp-text">Changelog</p>
          <p class="mt-0.5 text-xs text-ctp-subtext1">What's new in recent releases</p>
        </div>
        <svg
          class="h-4 w-4 shrink-0 text-ctp-subtext0"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          aria-hidden="true"
        >
          <path d="M6 3l5 5-5 5" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </router-link>
    </section>

    <!-- Contact form -->
    <section class="mt-8">
      <h2 class="text-sm font-semibold text-ctp-text">Report an issue</h2>

      <div v-if="submitted" class="mt-4 flex flex-col items-center rounded-lg border border-ctp-surface0 bg-ctp-base py-10 text-center">
        <div class="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-ctp-green/15">
          <svg class="h-5 w-5 text-ctp-green" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M2.5 8.5l4 4 7-7" />
          </svg>
        </div>
        <p class="text-sm font-medium text-ctp-text">Ticket submitted</p>
        <p class="mt-1 text-xs text-ctp-subtext1">We'll get back to you as soon as possible.</p>
        <button class="mt-4 text-xs text-ctp-mauve hover:underline" @click="resetForm">
          Submit another
        </button>
      </div>

      <form v-else class="mt-4 space-y-4" @submit.prevent="submitForm">
        <div>
          <label for="support-category" class="mb-1 block text-xs font-medium text-ctp-subtext1">Category</label>
          <select
            id="support-category"
            v-model="form.category"
            class="h-9 w-full rounded-md border border-ctp-surface1 bg-ctp-base px-3 text-sm text-ctp-text focus:border-ctp-mauve focus:outline-none"
          >
            <option value="" disabled>Select a category…</option>
            <option v-for="cat in CATEGORIES" :key="cat" :value="cat">{{ cat }}</option>
          </select>
        </div>

        <div>
          <label for="support-subject" class="mb-1 block text-xs font-medium text-ctp-subtext1">Subject</label>
          <input
            id="support-subject"
            v-model="form.subject"
            type="text"
            placeholder="Brief summary of your issue"
            class="h-9 w-full rounded-md border border-ctp-surface1 bg-ctp-base px-3 text-sm text-ctp-text placeholder:text-ctp-subtext0 focus:border-ctp-mauve focus:outline-none"
          />
        </div>

        <div>
          <label for="support-description" class="mb-1 block text-xs font-medium text-ctp-subtext1">Description</label>
          <textarea
            id="support-description"
            v-model="form.description"
            rows="6"
            placeholder="Describe your issue in detail…"
            class="w-full resize-none rounded-md border border-ctp-surface1 bg-ctp-base p-3 text-sm text-ctp-text placeholder:text-ctp-subtext0 focus:border-ctp-mauve focus:outline-none"
          />
        </div>

        <div class="rounded-md bg-ctp-surface0/50 p-3 text-xs text-ctp-subtext0">
          <p class="mb-1 font-medium text-ctp-subtext1">Auto-attached context</p>
          <p>Account ID, user ID, current route, and browser info will be included automatically.</p>
        </div>

        <div v-if="submitError" class="rounded-md bg-ctp-red/10 p-3 text-xs text-ctp-red">
          {{ submitError }}
        </div>

        <button
          type="submit"
          class="w-full rounded-lg bg-ctp-mauve px-4 py-2.5 text-sm font-medium text-ctp-base transition-opacity disabled:opacity-50"
          :disabled="!canSubmit"
        >
          {{ submitting ? 'Submitting…' : 'Submit ticket' }}
        </button>
      </form>
    </section>

    <!-- Relevant articles -->
    <section class="mt-8 pb-8">
      <h2 class="text-sm font-semibold text-ctp-text">Related help articles</h2>
      <div class="mt-3 space-y-2">
        <div
          v-for="article in relevantArticles"
          :key="article.title"
          class="rounded-lg border border-ctp-surface0 bg-ctp-base p-3"
        >
          <p class="text-sm font-medium text-ctp-text">{{ article.title }}</p>
          <p class="mt-1 text-xs leading-relaxed text-ctp-subtext1">{{ article.excerpt }}</p>
        </div>
      </div>
    </section>
  </div>
</template>

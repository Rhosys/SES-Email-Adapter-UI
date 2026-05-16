<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useAccountStore } from '@/stores/account'
import { loginClient } from '@/lib/auth'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const route = useRoute()
const accountStore = useAccountStore()

type Tab = 'help' | 'contact' | 'status'
const activeTab = ref<Tab>('help')

const searchQuery = ref('')
const userId = ref<string | null>(null)

const form = ref({ category: '', subject: '', description: '' })
const submitted = ref(false)

watch(
  () => props.open,
  (open) => {
    if (open && !userId.value) {
      try {
        const identity = loginClient.getUserIdentity()
        userId.value = (identity?.sub as string) ?? null
      } catch {
        // best-effort
      }
    }
  },
)

const ARTICLES = [
  {
    title: 'Inbox and arc lifecycle',
    excerpt:
      'Arcs group related emails into threads. New signals arrive in your inbox; archive to dismiss, or let rules handle them automatically.',
    tags: ['inbox', 'arc', 'archive', 'signal'],
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
      'Labels tag arcs for organisation. Saved views are reusable filters — by label, workflow, sender, or status — accessible from the sidebar.',
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
      'Use the search bar to find arcs, senders, aliases, or rules. The sidebar shows a quick preview; the full search page shows all results.',
    tags: ['search', 'arcs', 'aliases', 'rules', 'find'],
  },
]

const CATEGORIES = [
  'General question',
  'Bug report',
  'Feature request',
  'Billing',
  'Account access',
]

const filteredArticles = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return ARTICLES
  return ARTICLES.filter(
    (a) =>
      a.title.toLowerCase().includes(q) ||
      a.excerpt.toLowerCase().includes(q) ||
      a.tags.some((t) => t.includes(q)),
  )
})

const canSubmit = computed(
  () => form.value.category && form.value.subject.trim() && form.value.description.trim(),
)

function buildContext(): string {
  const lines = [
    `Account: ${accountStore.accountId ?? 'unknown'}`,
    `User: ${userId.value ?? 'unknown'}`,
    `Route: ${route.fullPath}`,
    `Browser: ${navigator.userAgent}`,
  ]
  const resourceId = route.params.id
  if (resourceId)
    lines.push(`Resource ID: ${Array.isArray(resourceId) ? resourceId[0] : resourceId}`)
  return lines.join('\n')
}

function submitForm() {
  const context = buildContext()
  const body = `${form.value.description.trim()}\n\n---\n${context}`
  const subject = `[${form.value.category}] ${form.value.subject.trim()}`
  window.open(
    `mailto:support@rhosys.cloud?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
  )
  submitted.value = true
}

function resetContact() {
  form.value = { category: '', subject: '', description: '' }
  submitted.value = false
}
</script>

<template>
  <Teleport to="body">
    <!-- Backdrop -->
    <Transition name="backdrop">
      <div v-if="open" class="fixed inset-0 z-40 bg-black/40" @click="emit('close')" />
    </Transition>

    <!-- Panel -->
    <Transition name="panel">
      <div
        v-if="open"
        class="fixed inset-y-0 right-0 z-50 flex w-96 max-w-full flex-col border-l border-ctp-surface0 bg-ctp-mantle shadow-2xl"
        role="dialog"
        aria-label="Support"
        @keydown.escape="emit('close')"
      >
        <!-- Header -->
        <div
          class="flex h-12 shrink-0 items-center justify-between border-b border-ctp-surface0 px-4"
        >
          <span class="text-sm font-semibold text-ctp-text">Help &amp; Support</span>
          <button
            class="flex h-7 w-7 items-center justify-center rounded text-ctp-subtext1 hover:bg-ctp-surface0 hover:text-ctp-text"
            aria-label="Close support panel"
            @click="emit('close')"
          >
            <svg class="h-4 w-4" viewBox="0 0 16 16" fill="currentColor">
              <path
                d="M2.146 2.854a.5.5 0 11.708-.708L8 7.293l5.146-5.147a.5.5 0 01.708.708L8.707 8l5.147 5.146a.5.5 0 01-.708.708L8 8.707l-5.146 5.147a.5.5 0 01-.708-.708L7.293 8 2.146 2.854z"
              />
            </svg>
          </button>
        </div>

        <!-- Tabs -->
        <div role="tablist" class="flex shrink-0 border-b border-ctp-surface0">
          <button
            v-for="tab in ['help', 'contact', 'status'] as Tab[]"
            :key="tab"
            role="tab"
            :aria-selected="activeTab === tab"
            class="flex-1 py-2.5 text-xs font-medium capitalize transition-colors"
            :class="
              activeTab === tab
                ? 'border-b-2 border-ctp-mauve text-ctp-mauve'
                : 'text-ctp-subtext1 hover:text-ctp-text'
            "
            @click="activeTab = tab"
          >
            {{ tab === 'help' ? 'Knowledge base' : tab === 'contact' ? 'Contact us' : 'Status' }}
          </button>
        </div>

        <!-- Body -->
        <div class="flex-1 overflow-y-auto">
          <!-- Knowledge base -->
          <div v-if="activeTab === 'help'" class="p-4">
            <input
              v-model="searchQuery"
              type="search"
              aria-label="Search articles"
              placeholder="Search articles…"
              class="mb-4 h-8 w-full rounded-md border border-ctp-surface1 bg-ctp-base px-3 text-sm text-ctp-text placeholder:text-ctp-subtext0 focus:border-ctp-mauve focus:outline-none"
            />

            <div
              v-if="filteredArticles.length === 0"
              class="py-8 text-center text-sm text-ctp-subtext0"
            >
              No articles match "{{ searchQuery }}"
            </div>

            <div v-else class="space-y-2">
              <div
                v-for="article in filteredArticles"
                :key="article.title"
                class="rounded-lg border border-ctp-surface0 bg-ctp-base p-3"
              >
                <p class="text-sm font-medium text-ctp-text">{{ article.title }}</p>
                <p class="mt-1 text-xs leading-relaxed text-ctp-subtext1">{{ article.excerpt }}</p>
              </div>
            </div>
          </div>

          <!-- Contact -->
          <div v-else-if="activeTab === 'contact'" class="p-4">
            <div v-if="submitted" class="flex flex-col items-center py-10 text-center">
              <div
                class="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-ctp-green/15"
              >
                <svg class="h-5 w-5 text-ctp-green" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M2 8l4 4 8-8" stroke="currentColor" stroke-width="1.5" fill="none" />
                </svg>
              </div>
              <p class="text-sm font-medium text-ctp-text">Email client opened</p>
              <p class="mt-1 text-xs text-ctp-subtext1">
                Your context has been pre-filled. Send the email to reach our support team.
              </p>
              <button class="mt-4 text-xs text-ctp-mauve hover:underline" @click="resetContact">
                Send another message
              </button>
            </div>

            <form v-else class="space-y-3" @submit.prevent="submitForm">
              <div>
                <label class="mb-1 block text-xs font-medium text-ctp-subtext1">Category</label>
                <select
                  v-model="form.category"
                  class="h-8 w-full rounded-md border border-ctp-surface1 bg-ctp-base px-2 text-sm text-ctp-text focus:border-ctp-mauve focus:outline-none"
                >
                  <option value="" disabled>Select a category…</option>
                  <option v-for="cat in CATEGORIES" :key="cat" :value="cat">{{ cat }}</option>
                </select>
              </div>

              <div>
                <label class="mb-1 block text-xs font-medium text-ctp-subtext1">Subject</label>
                <input
                  v-model="form.subject"
                  type="text"
                  placeholder="Brief summary of your issue"
                  class="h-8 w-full rounded-md border border-ctp-surface1 bg-ctp-base px-3 text-sm text-ctp-text placeholder:text-ctp-subtext0 focus:border-ctp-mauve focus:outline-none"
                />
              </div>

              <div>
                <label class="mb-1 block text-xs font-medium text-ctp-subtext1">Description</label>
                <textarea
                  v-model="form.description"
                  rows="5"
                  placeholder="Describe your issue in detail…"
                  class="w-full resize-none rounded-md border border-ctp-surface1 bg-ctp-base p-3 text-sm text-ctp-text placeholder:text-ctp-subtext0 focus:border-ctp-mauve focus:outline-none"
                />
              </div>

              <div class="rounded-md bg-ctp-surface0/50 p-3 text-xs text-ctp-subtext0">
                <p class="mb-1 font-medium text-ctp-subtext1">Auto-attached context</p>
                <p>
                  Account ID, user ID, current route, browser info{{
                    route.params.id ? ', and resource ID' : ''
                  }}
                  will be included automatically.
                </p>
              </div>

              <button
                type="submit"
                class="w-full rounded-lg bg-ctp-mauve px-4 py-2 text-sm font-medium text-ctp-base transition-opacity disabled:opacity-50"
                :disabled="!canSubmit"
              >
                Open email client
              </button>
            </form>
          </div>

          <!-- Status -->
          <div v-else class="p-4 space-y-3">
            <a
              href="https://status.rhosys.cloud"
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
                fill="currentColor"
              >
                <path d="M6.5 1.5a.5.5 0 000 1H13V8a.5.5 0 001 0V2a.5.5 0 00-.5-.5H6.5z" />
                <path
                  d="M2 13.5A1.5 1.5 0 013.5 12H9a1.5 1.5 0 011.5 1.5v.5a.5.5 0 001 0v-.5A2.5 2.5 0 009 11H3.5A2.5 2.5 0 001 13.5v.5a.5.5 0 001 0v-.5z"
                />
                <path
                  d="M13.354 2.646a.5.5 0 010 .708l-10 10a.5.5 0 01-.708-.708l10-10a.5.5 0 01.708 0z"
                />
              </svg>
            </a>

            <router-link
              to="/changelog"
              class="flex items-center justify-between rounded-lg border border-ctp-surface0 bg-ctp-base p-4 transition-colors hover:bg-ctp-surface0"
              @click="emit('close')"
            >
              <div>
                <p class="text-sm font-medium text-ctp-text">Changelog</p>
                <p class="mt-0.5 text-xs text-ctp-subtext1">What's new in recent releases</p>
              </div>
              <svg
                class="h-4 w-4 shrink-0 text-ctp-subtext0"
                viewBox="0 0 16 16"
                fill="currentColor"
              >
                <path
                  fill-rule="evenodd"
                  d="M4.5 11.5A.5.5 0 015 11h6a.5.5 0 010 1H5a.5.5 0 01-.5-.5zm-2-4A.5.5 0 013 7h10a.5.5 0 010 1H3a.5.5 0 01-.5-.5zm-2-4A.5.5 0 011 3h12a.5.5 0 010 1H1a.5.5 0 01-.5-.5z"
                />
              </svg>
            </router-link>

            <div class="rounded-lg border border-ctp-surface0 bg-ctp-base p-4">
              <p class="text-sm font-medium text-ctp-text">Email support</p>
              <p class="mt-0.5 text-xs text-ctp-subtext1">
                <a href="mailto:support@rhosys.cloud" class="text-ctp-mauve hover:underline"
                  >support@rhosys.cloud</a
                >
              </p>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.backdrop-enter-active,
.backdrop-leave-active {
  transition: opacity 200ms ease;
}
.backdrop-enter-from,
.backdrop-leave-to {
  opacity: 0;
}

.panel-enter-active,
.panel-leave-active {
  transition: transform 200ms ease;
}
.panel-enter-from,
.panel-leave-to {
  transform: translateX(100%);
}
</style>

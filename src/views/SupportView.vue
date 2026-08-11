<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRoute } from 'vue-router'
import { useAccountStore } from '@/stores/account'
import { api } from '@/lib/api'
import buildInfo from '@/lib/buildInfo'
import logger from '@/lib/logger'
import { useIdentity } from '@/composables/useIdentity'

const route = useRoute()
const accountStore = useAccountStore()

const form = ref({ category: '', subject: '', description: '' })
const submitting = ref(false)
const submitted = ref(false)
const submitError = ref<string | null>(null)

const identity = useIdentity()
identity.load()

const browserInfo = navigator.userAgent

const CATEGORIES = [
  'Bug report',
  'Feature request',
  'General question',
  'Billing',
  'Account access',
]

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
    `User: ${identity.userId ?? 'unknown'}`,
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
    logger.error({ title: '[support] POST /support-tickets returned 404 — endpoint not implemented. Falling back to mailto.' })
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
    <p class="mt-1 text-sm text-ctp-subtext1">Report an issue or leave feedback.</p>

    <!-- Contact form -->
    <section class="mt-6">

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

        <p class="text-xs text-ctp-subtext0">
          Account ID: {{ accountStore.accountId ?? 'unknown' }}, User ID: {{ identity.userId ?? 'unknown' }}, Browser: {{ browserInfo }}
        </p>

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
  </div>
</template>

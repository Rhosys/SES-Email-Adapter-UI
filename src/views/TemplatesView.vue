<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import Handlebars from 'handlebars'
import { marked } from 'marked'
import { useTemplatesStore } from '@/stores/templates'
import { useAccountStore } from '@/stores/account'
import type { EmailTemplate } from '@/types/server'

const store = useTemplatesStore()
const accountStore = useAccountStore()

// ─── Editor state ─────────────────────────────────────────────────────────────

const editingId = ref<string | null>(null)  // null = new template
const showEditor = ref(false)
const showPreview = ref(false)
const saving = ref(false)

const draftName = ref('')
const draftSubject = ref('')
const draftBody = ref('')

// Sample values used to resolve interpolation variables in the live preview
const sampleVars = {
  sender: { name: 'Jane Smith', address: 'jane@example.com' },
  signal: { subject: 'Quick question about your service' },
  arc: { workflow: 'conversation' },
}

const previewSubject = computed(() => {
  try {
    return Handlebars.compile(draftSubject.value)(sampleVars)
  } catch {
    return draftSubject.value
  }
})

const previewHtml = computed(() => {
  try {
    const rendered = Handlebars.compile(draftBody.value)(sampleVars)
    return marked.parse(rendered) as string
  } catch {
    return '<p style="color:#f38ba8">Template syntax error</p>'
  }
})

const canSave = computed(
  () => draftName.value.trim().length > 0 && draftSubject.value.trim().length > 0,
)

function openNew() {
  editingId.value = null
  draftName.value = ''
  draftSubject.value = ''
  draftBody.value = ''
  showPreview.value = false
  showEditor.value = true
}

function openEdit(tpl: EmailTemplate) {
  editingId.value = tpl.id
  draftName.value = tpl.name
  draftSubject.value = tpl.subject
  draftBody.value = tpl.body
  showPreview.value = false
  showEditor.value = true
}

function closeEditor() {
  showEditor.value = false
  store.clearError()
}

async function save() {
  if (!canSave.value || saving.value) return
  saving.value = true
  const body = { name: draftName.value.trim(), subject: draftSubject.value.trim(), body: draftBody.value }
  let ok: boolean
  if (editingId.value) {
    ok = await store.updateTemplate(editingId.value, body)
  } else {
    ok = !!(await store.createTemplate(body))
  }
  saving.value = false
  if (ok) closeEditor()
}

async function remove(tpl: EmailTemplate) {
  if (!confirm(`Delete "${tpl.name}"? Rules using this template will stop working.`)) return
  await store.deleteTemplate(tpl.id)
}

// ─── Variable reference chips ─────────────────────────────────────────────────

const VARS = [
  { label: '{{sender.name}}', title: "Sender's display name" },
  { label: '{{sender.address}}', title: "Sender's email address" },
  { label: '{{signal.subject}}', title: 'Subject of the incoming email' },
  { label: '{{arc.workflow}}', title: 'Workflow category of the conversation' },
]

function insertVar(v: string) {
  draftBody.value += v
}

// ─── Relative time ────────────────────────────────────────────────────────────

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

onMounted(async () => {
  if (!accountStore.accountId) await accountStore.fetchAccount()
  await store.fetchTemplates()
})
</script>

<template>
  <div class="flex h-full flex-col">
    <header class="border-b border-ctp-surface0 bg-ctp-mantle px-4 py-3">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-lg font-semibold">Templates</h1>
          <p class="mt-0.5 text-xs text-ctp-subtext0">
            Reusable email bodies for auto-reply and auto-draft rule actions
          </p>
        </div>
        <button
          class="rounded-lg bg-ctp-mauve px-3 py-1.5 text-sm font-medium text-ctp-base hover:opacity-90"
          @click="openNew"
        >
          + New template
        </button>
      </div>
    </header>

    <main class="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
      <!-- Error -->
      <div
        v-if="store.error && !showEditor"
        class="mb-4 rounded-lg border border-ctp-red bg-ctp-red/10 px-4 py-3 text-sm text-ctp-red"
      >
        {{ store.error }}
        <button class="ml-2 underline" @click="store.clearError()">Dismiss</button>
      </div>

      <!-- Loading -->
      <div v-if="store.loading" class="py-20 text-center text-sm text-ctp-subtext0">Loading…</div>

      <!-- Empty -->
      <div v-else-if="!showEditor && store.templates.length === 0" class="py-20 text-center">
        <p class="text-base font-medium text-ctp-text">No templates yet</p>
        <p class="mx-auto mt-2 max-w-sm text-sm text-ctp-subtext0">
          Create a template once, reuse it across as many rules as you like — for auto-replies or
          pre-drafted responses that go out the moment an email matches.
        </p>
        <button
          class="mt-4 rounded-lg bg-ctp-mauve px-4 py-2 text-sm font-medium text-ctp-base hover:opacity-90"
          @click="openNew"
        >
          Create your first template
        </button>
      </div>

      <!-- Template list -->
      <div
        v-else-if="!showEditor && store.templates.length > 0"
        class="divide-y divide-ctp-surface0 rounded-lg border border-ctp-surface0"
      >
        <div
          v-for="tpl in store.templates"
          :key="tpl.id"
          class="flex items-start justify-between gap-4 px-4 py-3"
        >
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium text-ctp-text">{{ tpl.name }}</p>
            <p class="mt-0.5 truncate text-xs text-ctp-subtext0">{{ tpl.subject }}</p>
            <p class="mt-0.5 text-xs text-ctp-surface2">Updated {{ relTime(tpl.updatedAt) }}</p>
          </div>
          <div class="flex shrink-0 gap-2">
            <button
              class="rounded border border-ctp-surface1 px-2.5 py-1 text-xs text-ctp-subtext1 hover:text-ctp-text"
              @click="openEdit(tpl)"
            >
              Edit
            </button>
            <button class="text-xs text-ctp-red hover:opacity-80" @click="remove(tpl)">
              Delete
            </button>
          </div>
        </div>
      </div>

      <!-- Editor -->
      <div v-if="showEditor" class="space-y-4">
        <div class="flex items-center justify-between">
          <h2 class="text-sm font-semibold text-ctp-text">
            {{ editingId ? 'Edit template' : 'New template' }}
          </h2>
          <button class="text-xs text-ctp-subtext0 hover:text-ctp-text" @click="closeEditor">
            ✕ Cancel
          </button>
        </div>

        <!-- Error inside editor -->
        <div
          v-if="store.error"
          class="rounded border border-ctp-red bg-ctp-red/10 px-3 py-2 text-xs text-ctp-red"
        >
          {{ store.error }}
        </div>

        <!-- Name -->
        <div>
          <label class="mb-1 block text-xs text-ctp-subtext0">Template name</label>
          <input
            v-model="draftName"
            type="text"
            placeholder="e.g. Out of office reply"
            class="w-full rounded-lg border border-ctp-surface1 bg-ctp-mantle px-3 py-2 text-sm text-ctp-text placeholder:text-ctp-subtext0 focus:border-ctp-mauve focus:outline-none"
          />
        </div>

        <!-- Subject -->
        <div>
          <label class="mb-1 block text-xs text-ctp-subtext0">Subject</label>
          <input
            v-model="draftSubject"
            type="text"
            placeholder="Re: {{signal.subject}}"
            class="w-full rounded-lg border border-ctp-surface1 bg-ctp-mantle px-3 py-2 text-sm text-ctp-text placeholder:text-ctp-subtext0 focus:border-ctp-mauve focus:outline-none"
          />
        </div>

        <!-- Body with edit/preview tabs -->
        <div>
          <div class="mb-1 flex items-center justify-between">
            <label class="text-xs text-ctp-subtext0">Body <span class="text-ctp-surface2">(markdown + variables)</span></label>
            <div class="flex gap-1">
              <button
                class="rounded px-2 py-0.5 text-xs transition-colors"
                :class="!showPreview ? 'bg-ctp-surface1 text-ctp-text' : 'text-ctp-subtext0 hover:text-ctp-text'"
                @click="showPreview = false"
              >
                Edit
              </button>
              <button
                class="rounded px-2 py-0.5 text-xs transition-colors"
                :class="showPreview ? 'bg-ctp-surface1 text-ctp-text' : 'text-ctp-subtext0 hover:text-ctp-text'"
                @click="showPreview = true"
              >
                Preview
              </button>
            </div>
          </div>

          <textarea
            v-if="!showPreview"
            v-model="draftBody"
            rows="10"
            placeholder="Hi {{sender.name}},&#10;&#10;Thanks for reaching out…"
            class="w-full resize-y rounded-lg border border-ctp-surface1 bg-ctp-mantle px-3 py-2 font-mono text-sm text-ctp-text placeholder:text-ctp-subtext0 focus:border-ctp-mauve focus:outline-none"
          />

          <div v-else class="rounded-lg border border-ctp-surface1 bg-ctp-mantle p-3">
            <p class="mb-2 text-xs text-ctp-subtext0">
              Subject: <span class="text-ctp-text">{{ previewSubject }}</span>
            </p>
            <iframe
              :srcdoc="previewHtml || '<p style=\'color:#6c7086;font-family:sans-serif;font-size:13px\'>Nothing to preview yet.</p>'"
              sandbox="allow-popups allow-popups-to-escape-sandbox"
              class="min-h-40 w-full rounded border border-ctp-surface0"
              style="border: none"
              title="Template preview"
            />
          </div>
        </div>

        <!-- Variable chips -->
        <div v-if="!showPreview">
          <p class="mb-1.5 text-xs text-ctp-subtext0">Insert variable</p>
          <div class="flex flex-wrap gap-1.5">
            <button
              v-for="v in VARS"
              :key="v.label"
              :title="v.title"
              class="rounded bg-ctp-surface1 px-2 py-0.5 font-mono text-xs text-ctp-subtext1 hover:bg-ctp-surface2 hover:text-ctp-text"
              @click="insertVar(v.label)"
            >
              {{ v.label }}
            </button>
          </div>
        </div>

        <!-- Actions -->
        <div class="flex gap-3">
          <button
            :disabled="!canSave || saving"
            class="rounded-lg bg-ctp-mauve px-4 py-2 text-sm font-medium text-ctp-base hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            @click="save"
          >
            {{ saving ? 'Saving…' : editingId ? 'Save changes' : 'Create template' }}
          </button>
          <button class="text-sm text-ctp-subtext0 hover:text-ctp-text" @click="closeEditor">
            Cancel
          </button>
        </div>
      </div>
    </main>
  </div>
</template>

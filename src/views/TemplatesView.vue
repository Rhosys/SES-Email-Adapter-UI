<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import Handlebars from 'handlebars'
import { marked } from 'marked'
import { useTemplatesStore } from '@/stores/templates'
import { useAccountStore } from '@/stores/account'
import type { EmailTemplate, TemplateFunction } from '@/types/server'

const store = useTemplatesStore()
const accountStore = useAccountStore()

// ─── Editor state ─────────────────────────────────────────────────────────────

const editingId = ref<string | null>(null)
const showEditor = ref(false)
const showPreview = ref(false)
const saving = ref(false)

const draftName = ref('')
const draftSubject = ref('')
const draftBody = ref('')
const draftFunctions = ref<TemplateFunction[]>([])

const canSave = computed(
  () =>
    draftName.value.trim().length > 0 &&
    draftSubject.value.trim().length > 0 &&
    draftFunctions.value.every((f) => f.name.trim().length > 0),
)

function openNew() {
  editingId.value = null
  draftName.value = ''
  draftSubject.value = ''
  draftBody.value = ''
  draftFunctions.value = []
  showPreview.value = false
  showEditor.value = true
}

function openEdit(tpl: EmailTemplate) {
  editingId.value = tpl.id
  draftName.value = tpl.name
  draftSubject.value = tpl.subject
  draftBody.value = tpl.body
  draftFunctions.value = tpl.functions.map((f) => ({ ...f }))
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
  const payload = {
    name: draftName.value.trim(),
    subject: draftSubject.value.trim(),
    body: draftBody.value,
    functions: draftFunctions.value.map((f) => ({ name: f.name.trim(), code: f.code })),
  }
  const ok = editingId.value
    ? await store.updateTemplate(editingId.value, payload)
    : !!(await store.createTemplate(payload))
  saving.value = false
  if (ok) closeEditor()
}

async function remove(tpl: EmailTemplate) {
  if (!confirm(`Delete "${tpl.name}"? Rules using this template will stop working.`)) return
  await store.deleteTemplate(tpl.id)
}

// ─── Function editor ──────────────────────────────────────────────────────────

function addFunction() {
  draftFunctions.value = [...draftFunctions.value, { name: '', code: '(signal, arc) => {\n  \n}' }]
}

function removeFunction(idx: number) {
  draftFunctions.value = draftFunctions.value.filter((_, i) => i !== idx)
}

function updateFnName(idx: number, name: string) {
  draftFunctions.value = draftFunctions.value.map((f, i) => (i === idx ? { ...f, name } : f))
}

function updateFnCode(idx: number, code: string) {
  draftFunctions.value = draftFunctions.value.map((f, i) => (i === idx ? { ...f, code } : f))
}

// ─── Live preview — Worker-based to sandbox user JS ──────────────────────────

// Sample data passed to user functions during preview
const SAMPLE_SIGNAL = {
  from: { name: 'Jane Smith', address: 'jane@example.com' },
  to: [{ address: 'you@yourdomain.com' }],
  subject: 'Quick question about your service',
  textBody: 'Hi, I have a question about order #12345. Can you help?',
  receivedAt: new Date().toISOString(),
}

const SAMPLE_ARC = {
  workflow: 'conversation',
  summary: 'Customer asking about order #12345',
  urgency: 'normal',
  labels: [],
}

// Each user function receives (signal, arc) and returns a string.
// We run them inside a Worker so user JS can't touch the main thread DOM.
const WORKER_SRC = `
self.onmessage = function(e) {
  var fns = e.data.fns, signal = e.data.signal, arc = e.data.arc
  var outputs = {}
  for (var i = 0; i < fns.length; i++) {
    var fn = fns[i]
    try {
      var f = new Function('signal', 'arc', 'return (' + fn.code + ')(signal, arc)')
      var result = f(signal, arc)
      outputs[fn.name] = typeof result === 'string' ? result : String(result == null ? '' : result)
    } catch (err) {
      outputs[fn.name] = '[Error: ' + err.message + ']'
    }
  }
  self.postMessage(outputs)
}
`

function runFunctionsInWorker(fns: TemplateFunction[]): Promise<Record<string, string>> {
  if (fns.length === 0) return Promise.resolve({})
  return new Promise((resolve) => {
    const blob = new Blob([WORKER_SRC], { type: 'application/javascript' })
    const url = URL.createObjectURL(blob)
    const worker = new Worker(url)
    const timeout = setTimeout(() => {
      resolve({})
      worker.terminate()
      URL.revokeObjectURL(url)
    }, 3000)
    worker.onmessage = (e: MessageEvent<Record<string, string>>) => {
      clearTimeout(timeout)
      resolve(e.data)
      worker.terminate()
      URL.revokeObjectURL(url)
    }
    worker.onerror = () => {
      clearTimeout(timeout)
      resolve({})
      worker.terminate()
      URL.revokeObjectURL(url)
    }
    worker.postMessage({ fns, signal: SAMPLE_SIGNAL, arc: SAMPLE_ARC })
  })
}

const fnOutputs = ref<Record<string, string>>({})
const previewError = ref<string | null>(null)
let debounceTimer: ReturnType<typeof setTimeout> | null = null

watch(
  [draftFunctions, draftBody, draftSubject],
  () => {
    if (!showPreview.value) return
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(async () => {
      fnOutputs.value = await runFunctionsInWorker(draftFunctions.value)
    }, 400)
  },
  { deep: true },
)

watch(showPreview, async (val) => {
  if (val) fnOutputs.value = await runFunctionsInWorker(draftFunctions.value)
})

const hbsContext = computed(() => ({
  sender: { name: SAMPLE_SIGNAL.from.name, address: SAMPLE_SIGNAL.from.address },
  fn: fnOutputs.value,
}))

const previewSubject = computed(() => {
  try {
    previewError.value = null
    return Handlebars.compile(draftSubject.value)(hbsContext.value)
  } catch (e) {
    return draftSubject.value
  }
})

const previewHtml = computed(() => {
  try {
    previewError.value = null
    const rendered = Handlebars.compile(draftBody.value)(hbsContext.value)
    return marked.parse(rendered) as string
  } catch (e) {
    previewError.value = e instanceof Error ? e.message : 'Template syntax error'
    return ''
  }
})

// ─── Utilities ────────────────────────────────────────────────────────────────

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
            <p class="mt-0.5 text-xs text-ctp-surface2">
              {{ tpl.functions.length > 0 ? `${tpl.functions.length} function${tpl.functions.length > 1 ? 's' : ''} · ` : '' }}Updated {{ relTime(tpl.updatedAt) }}
            </p>
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
      <div v-if="showEditor" class="space-y-5">
        <div class="flex items-center justify-between">
          <h2 class="text-sm font-semibold text-ctp-text">
            {{ editingId ? 'Edit template' : 'New template' }}
          </h2>
          <button class="text-xs text-ctp-subtext0 hover:text-ctp-text" @click="closeEditor">
            ✕ Cancel
          </button>
        </div>

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
            placeholder="e.g. Order confirmation reply"
            class="w-full rounded-lg border border-ctp-surface1 bg-ctp-mantle px-3 py-2 text-sm text-ctp-text placeholder:text-ctp-subtext0 focus:border-ctp-mauve focus:outline-none"
          />
        </div>

        <!-- Subject -->
        <div>
          <label class="mb-1 block text-xs text-ctp-subtext0">Subject</label>
          <input
            v-model="draftSubject"
            type="text"
            placeholder="Re: your enquiry"
            class="w-full rounded-lg border border-ctp-surface1 bg-ctp-mantle px-3 py-2 text-sm text-ctp-text placeholder:text-ctp-subtext0 focus:border-ctp-mauve focus:outline-none"
          />
        </div>

        <!-- Body with edit/preview tabs -->
        <div>
          <div class="mb-1 flex items-center justify-between">
            <label class="text-xs text-ctp-subtext0">
              Body
              <span class="text-ctp-surface2">
                — use <code class="font-mono">{{'{{'}}sender.name{{'}}'}}</code>,
                <code class="font-mono">{{'{{'}}sender.address{{'}}'}}</code>, or
                <code class="font-mono">{{'{{'}}fn.yourFunction{{'}}'}}</code>
              </span>
            </label>
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
            placeholder="Hi {{sender.name}},&#10;&#10;Thanks for reaching out. {{fn.greeting}}&#10;&#10;Best regards"
            class="w-full resize-y rounded-lg border border-ctp-surface1 bg-ctp-mantle px-3 py-2 font-mono text-sm text-ctp-text placeholder:text-ctp-subtext0 focus:border-ctp-mauve focus:outline-none"
          />

          <div v-else class="rounded-lg border border-ctp-surface1 bg-ctp-mantle p-3">
            <p class="mb-2 text-xs text-ctp-subtext0">
              Subject: <span class="text-ctp-text">{{ previewSubject }}</span>
            </p>
            <div
              v-if="previewError"
              class="mb-2 rounded bg-ctp-red/10 px-2 py-1 font-mono text-xs text-ctp-red"
            >
              {{ previewError }}
            </div>
            <iframe
              v-else
              :srcdoc="previewHtml || '<p style=\'color:#6c7086;font-family:sans-serif;font-size:13px\'>Nothing to preview yet.</p>'"
              sandbox="allow-popups allow-popups-to-escape-sandbox"
              class="min-h-40 w-full rounded border border-ctp-surface0"
              style="border: none"
              title="Template preview"
            />
            <!-- Show resolved fn outputs for debugging -->
            <div v-if="draftFunctions.length > 0" class="mt-3 border-t border-ctp-surface0 pt-3">
              <p class="mb-1 text-xs text-ctp-subtext0">Function outputs (sample data)</p>
              <div
                v-for="(val, key) in fnOutputs"
                :key="key"
                class="flex gap-2 font-mono text-xs"
              >
                <span class="shrink-0 text-ctp-mauve">fn.{{ key }}</span>
                <span class="text-ctp-subtext1">→</span>
                <span class="text-ctp-text">{{ val }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Functions -->
        <div>
          <div class="mb-2 flex items-center justify-between">
            <div>
              <p class="text-xs font-medium text-ctp-text">Functions</p>
              <p class="text-xs text-ctp-subtext0">
                Each function receives <code class="font-mono">(signal, arc)</code> and returns a
                string. Reference its output in the body with
                <code class="font-mono">{{'{{'}}fn.name{{'}}'}}</code>.
              </p>
            </div>
            <button
              class="rounded border border-ctp-surface1 px-2.5 py-1 text-xs text-ctp-subtext1 hover:text-ctp-text"
              @click="addFunction"
            >
              + Add function
            </button>
          </div>

          <div v-if="draftFunctions.length === 0" class="rounded-lg border border-dashed border-ctp-surface1 py-6 text-center text-xs text-ctp-subtext0">
            No functions yet — add one to compute dynamic content from the incoming signal and arc.
          </div>

          <div v-else class="space-y-3">
            <div
              v-for="(fn, idx) in draftFunctions"
              :key="idx"
              class="rounded-lg border border-ctp-surface1 bg-ctp-mantle p-3"
            >
              <div class="mb-2 flex items-center gap-2">
                <code class="text-xs text-ctp-subtext0">fn.</code>
                <input
                  :value="fn.name"
                  type="text"
                  placeholder="functionName"
                  class="flex-1 rounded border border-ctp-surface1 bg-ctp-base px-2 py-1 font-mono text-xs text-ctp-text placeholder:text-ctp-subtext0 focus:border-ctp-mauve focus:outline-none"
                  @input="updateFnName(idx, ($event.target as HTMLInputElement).value)"
                />
                <button
                  class="text-xs text-ctp-subtext0 hover:text-ctp-red"
                  @click="removeFunction(idx)"
                >
                  Remove
                </button>
              </div>
              <textarea
                :value="fn.code"
                rows="5"
                class="w-full resize-y rounded border border-ctp-surface1 bg-ctp-base px-2 py-1.5 font-mono text-xs text-ctp-text focus:border-ctp-mauve focus:outline-none"
                @input="updateFnCode(idx, ($event.target as HTMLTextAreaElement).value)"
              />
            </div>
          </div>
        </div>

        <!-- Save / cancel -->
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

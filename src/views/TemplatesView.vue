<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import Handlebars from 'handlebars'
import { marked } from 'marked'
import { useTemplatesStore } from '@/stores/templates'
import { useAccountStore } from '@/stores/account'
import SignalBrowser from '@/components/SignalBrowser.vue'
import { useHbsAutocomplete } from '@/composables/useHbsAutocomplete'
import type { EmailTemplate, TemplateFunction } from '@/types/server'
import AsyncButton from '@/components/ui/AsyncButton.vue'

const store = useTemplatesStore()
const accountStore = useAccountStore()

// ─── Editor state ─────────────────────────────────────────────────────────────

const editingId = ref<string | null>(null)
const showEditor = ref(false)
const showPreview = ref(false)
const saving = ref(false)
const validating = ref(false)
const fnErrors = ref<Record<string, string>>({})

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

const hasValidationErrors = computed(() => Object.keys(fnErrors.value).length > 0)

function openNew() {
  editingId.value = null
  draftName.value = ''
  draftSubject.value = ''
  draftBody.value = ''
  draftFunctions.value = []
  fnErrors.value = {}
  showPreview.value = false
  showEditor.value = true
}

function openEdit(tpl: EmailTemplate) {
  editingId.value = tpl.templateId
  draftName.value = tpl.name
  draftSubject.value = tpl.subject
  draftBody.value = tpl.body
  draftFunctions.value = (tpl.functions ?? []).map((f) => ({ ...f }))
  fnErrors.value = {}
  showPreview.value = false
  showEditor.value = true
}

function closeEditor() {
  showEditor.value = false
  store.clearError()
}

async function save() {
  if (!canSave.value || saving.value || validating.value) return

  // Validate functions before saving
  validating.value = true
  const { errors } = await runWorker(draftFunctions.value)
  validating.value = false
  fnErrors.value = errors

  if (Object.keys(errors).length > 0) return

  saving.value = true
  const payload = {
    name: draftName.value.trim(),
    subject: draftSubject.value.trim(),
    body: draftBody.value,
    functions: draftFunctions.value.map((f) => ({ name: f.name.trim(), code: f.code })),
  }
  const result = editingId.value
    ? await store.updateTemplate(editingId.value, payload)
    : await store.createTemplate(payload)
  saving.value = false
  if (result.isOk()) closeEditor()
}

async function remove(tpl: EmailTemplate) {
  if (!confirm(`Delete "${tpl.name}"? Rules using this template will stop working.`)) return
  await store.deleteTemplate(tpl.templateId)
}

function openClone(tpl: EmailTemplate) {
  editingId.value = null
  draftName.value = `Copy of ${tpl.name}`
  draftSubject.value = tpl.subject
  draftBody.value = tpl.body
  draftFunctions.value = (tpl.functions ?? []).map((f) => ({ ...f }))
  fnErrors.value = {}
  showPreview.value = false
  showEditor.value = true
}

// ─── Function editor ──────────────────────────────────────────────────────────

const editingFnIdx = ref<number | null>(null)

function addFunction() {
  draftFunctions.value = [...draftFunctions.value, { name: '', code: '(signal, arc) => {\n  \n}' }]
  editingFnIdx.value = draftFunctions.value.length - 1
}

function removeFunction(idx: number) {
  draftFunctions.value = draftFunctions.value.filter((_, i) => i !== idx)
}



// ─── Worker sandbox ───────────────────────────────────────────────────────────

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

const WORKER_SRC = `
self.onmessage = function(e) {
  var fns = e.data.fns, signal = e.data.signal, arc = e.data.arc
  var outputs = {}, errors = {}
  for (var i = 0; i < fns.length; i++) {
    var fn = fns[i]
    try {
      var f = new Function('signal', 'arc', 'return (' + fn.code + ')(signal, arc)')
      var result = f(signal, arc)
      outputs[fn.name] = typeof result === 'string' ? result : String(result == null ? '' : result)
    } catch (err) {
      errors[fn.name] = err.message
      outputs[fn.name] = ''
    }
  }
  self.postMessage({ outputs: outputs, errors: errors })
}
`

function runWorker(
  fns: TemplateFunction[],
): Promise<{ outputs: Record<string, string>; errors: Record<string, string> }> {
  if (fns.length === 0) return Promise.resolve({ outputs: {}, errors: {} })
  return new Promise((resolve) => {
    const blob = new Blob([WORKER_SRC], { type: 'application/javascript' })
    const url = URL.createObjectURL(blob)
    const worker = new Worker(url)
    const timeout = setTimeout(() => {
      resolve({ outputs: {}, errors: { _timeout: 'Functions timed out after 3 seconds' } })
      worker.terminate()
      URL.revokeObjectURL(url)
    }, 3000)
    worker.onmessage = (e: MessageEvent<{ outputs: Record<string, string>; errors: Record<string, string> }>) => {
      clearTimeout(timeout)
      resolve(e.data)
      worker.terminate()
      URL.revokeObjectURL(url)
    }
    worker.onerror = () => {
      clearTimeout(timeout)
      resolve({ outputs: {}, errors: {} })
      worker.terminate()
      URL.revokeObjectURL(url)
    }
    worker.postMessage({ fns, signal: SAMPLE_SIGNAL, arc: SAMPLE_ARC })
  })
}

// ─── Live preview ─────────────────────────────────────────────────────────────

const fnOutputs = ref<Record<string, string>>({})
let debounceTimer: ReturnType<typeof setTimeout> | null = null

watch(
  [draftFunctions, draftBody, draftSubject],
  () => {
    if (!showPreview.value) return
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(async () => {
      const { outputs } = await runWorker(draftFunctions.value)
      fnOutputs.value = outputs
    }, 400)
  },
  { deep: true },
)

watch(showPreview, async (val) => {
  if (val) {
    const { outputs } = await runWorker(draftFunctions.value)
    fnOutputs.value = outputs
  }
})

const hbsContext = computed(() => ({
  sender: { name: SAMPLE_SIGNAL.from.name, address: SAMPLE_SIGNAL.from.address },
  fn: fnOutputs.value,
}))

const previewSubject = computed(() => {
  try {
    return Handlebars.compile(draftSubject.value)(hbsContext.value)
  } catch {
    return draftSubject.value
  }
})

const _bodyResult = computed(() => {
  try {
    const rendered = Handlebars.compile(draftBody.value)(hbsContext.value)
    return { html: marked.parse(rendered) as string, error: null as string | null }
  } catch (e) {
    return { html: '', error: e instanceof Error ? e.message : 'Template syntax error' }
  }
})

const previewHtml = computed(() => _bodyResult.value.html)
const previewError = computed(() => _bodyResult.value.error)

// ─── Handlebars autocomplete ──────────────────────────────────────────────────

const hbsCompletions = computed(() => [
  { token: 'sender.name', label: 'sender.name', type: 'string', example: SAMPLE_SIGNAL.from.name },
  { token: 'sender.address', label: 'sender.address', type: 'string', example: SAMPLE_SIGNAL.from.address },
  ...draftFunctions.value
    .filter((f) => f.name.trim().length > 0)
    .map((f) => ({ token: `fn.${f.name}`, label: `fn.${f.name}`, type: 'function', example: 'output of your function' })),
])

const ac = useHbsAutocomplete(() => hbsCompletions.value)

// Helper: wrap a token in {{}} without triggering Vue's template parser
// { = { } = }
function hbsToken(token: string) {
  return '{{' + token + '}}'
}

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
      <div
        v-if="store.loading"
        role="status"
        aria-label="Loading templates…"
        class="animate-pulse divide-y divide-ctp-surface0 rounded-lg border border-ctp-surface0"
      >
        <div v-for="i in 4" :key="i" class="flex items-center gap-3 px-4 py-4">
          <div class="flex-1 space-y-1.5">
            <div class="h-4 rounded bg-ctp-surface1" :style="{ width: `${40 + (i * 19) % 45}%` }" />
            <div class="h-3 w-48 rounded bg-ctp-surface1" />
          </div>
          <div class="h-7 w-14 shrink-0 rounded bg-ctp-surface1" />
          <div class="h-7 w-14 shrink-0 rounded bg-ctp-surface1" />
        </div>
      </div>

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
          :key="tpl.templateId"
          class="flex items-start justify-between gap-4 px-4 py-3"
        >
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium text-ctp-text">
              {{ tpl.name }}
              <span
                v-if="tpl.functions?.some(f => f.lastError)"
                class="ml-1.5 inline-block h-2 w-2 rounded-full bg-ctp-red"
                title="Function error"
                aria-label="Has function error"
              />
            </p>
            <p class="mt-0.5 truncate text-xs text-ctp-subtext0">{{ tpl.subject }}</p>
            <p class="mt-0.5 text-xs text-ctp-surface2">
              {{ (tpl.functions?.length ?? 0) > 0 ? `${tpl.functions!.length} function${tpl.functions!.length > 1 ? 's' : ''} · ` : '' }}Updated {{ relTime(tpl.updatedAt) }}
            </p>
          </div>
          <div class="flex shrink-0 gap-2">
            <button
              class="rounded border border-ctp-surface1 px-2.5 py-1 text-xs text-ctp-subtext1 hover:text-ctp-text"
              @click="openEdit(tpl)"
            >
              Edit
            </button>
            <button
              class="rounded border border-ctp-surface1 px-2.5 py-1 text-xs text-ctp-subtext1 hover:text-ctp-text"
              title="Duplicate this template"
              @click="openClone(tpl)"
            >
              Clone
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
          <label for="template-name" class="mb-1 block text-xs text-ctp-subtext0">Template name</label>
          <input
            id="template-name"
            v-model="draftName"
            type="text"
            placeholder="e.g. Order confirmation reply"
            class="w-full rounded-lg border border-ctp-surface1 bg-ctp-mantle px-3 py-2 text-sm text-ctp-text placeholder:text-ctp-subtext0 focus:border-ctp-mauve focus:outline-none"
          />
        </div>

        <!-- Variable reference -->
        <details class="rounded border border-ctp-surface1 text-xs">
          <summary class="cursor-pointer px-3 py-2 text-ctp-subtext0 hover:text-ctp-text select-none">
            Template Properties
          </summary>
          <div class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 px-3 py-2 pb-3">
            <code class="font-mono text-ctp-mauve">&#123;&#123;from.address&#125;&#125;</code><span class="text-ctp-subtext0">Sender email address</span>
            <code class="font-mono text-ctp-mauve">&#123;&#123;from.name&#125;&#125;</code><span class="text-ctp-subtext0">Sender display name</span>
            <code class="font-mono text-ctp-mauve">&#123;&#123;subject&#125;&#125;</code><span class="text-ctp-subtext0">Email subject line</span>
            <code class="font-mono text-ctp-mauve">&#123;&#123;to&#125;&#125;</code><span class="text-ctp-subtext0">Recipient address(es)</span>
            <code class="font-mono text-ctp-mauve">&#123;&#123;receivedAt&#125;&#125;</code><span class="text-ctp-subtext0">ISO timestamp the email was received</span>
            <code class="font-mono text-ctp-mauve">&#123;&#123;arcId&#125;&#125;</code><span class="text-ctp-subtext0">Thread / arc identifier</span>
            <code class="font-mono text-ctp-mauve">&#123;&#123;accountId&#125;&#125;</code><span class="text-ctp-subtext0">Your account ID</span>
            <!-- Dynamic properties (functions) -->
            <template v-for="fn in draftFunctions.filter(f => f.name.trim())" :key="fn.name">
              <button class="text-left font-mono text-ctp-green hover:underline" @click="editingFnIdx = draftFunctions.indexOf(fn)">&#123;&#123;fn.{{ fn.name }}&#125;&#125;</button><span class="text-ctp-subtext0">Dynamic property</span>
            </template>
          </div>
          <div class="border-t border-ctp-surface0 px-3 py-2">
            <button
              class="text-xs text-ctp-mauve hover:text-ctp-mauve/80"
              @click="addFunction"
            >
              ＋ Add dynamic property
            </button>
          </div>
        </details>

        <!-- Subject -->
        <div>
          <label for="template-subject" class="mb-1 block text-xs text-ctp-subtext0">
            Subject
            <span class="text-ctp-surface2 font-normal"> — type <code class="font-mono">&#123;&#123;&#125;&#125;</code> for variables</span>
          </label>
          <input
            id="template-subject"
            v-model="draftSubject"
            type="text"
            placeholder="Re: {{sender.name}}'s enquiry"
            class="w-full rounded-lg border border-ctp-surface1 bg-ctp-mantle px-3 py-2 text-sm text-ctp-text placeholder:text-ctp-subtext0 focus:border-ctp-mauve focus:outline-none"
            @input="ac.onInput"
            @keydown="ac.onKeydown"
            @blur="ac.close"
          />
        </div>

        <!-- Body with edit/preview tabs -->
        <div>
          <div class="mb-1 flex items-center justify-between">
            <label for="template-body" class="text-xs text-ctp-subtext0">
              Body
              <span class="font-normal text-ctp-surface2"> — type <code class="font-mono">&#123;&#123;&#125;&#125;</code> for variables</span>
            </label>
            <div class="flex gap-1">
              <button
                :aria-pressed="!showPreview"
                class="rounded px-2 py-0.5 text-xs transition-colors"
                :class="!showPreview ? 'bg-ctp-surface1 text-ctp-text' : 'text-ctp-subtext0 hover:text-ctp-text'"
                @click="showPreview = false"
              >
                Edit
              </button>
              <button
                :aria-pressed="showPreview"
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
            id="template-body"
            v-model="draftBody"
            rows="10"
            placeholder="Hi {{sender.name}},&#10;&#10;Thanks for reaching out. {{fn.greeting}}&#10;&#10;Best regards"
            class="w-full resize-y rounded-lg border border-ctp-surface1 bg-ctp-mantle px-3 py-2 font-mono text-sm text-ctp-text placeholder:text-ctp-subtext0 focus:border-ctp-mauve focus:outline-none"
            @input="ac.onInput"
            @keydown="ac.onKeydown"
            @blur="ac.close"
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

        <!-- Dynamic Properties (function list — click to edit in popup) -->
        <div v-if="draftFunctions.length > 0">
          <!-- Validation error summary -->
          <div
            v-if="hasValidationErrors"
            class="mb-3 rounded border border-ctp-red bg-ctp-red/10 px-3 py-2 text-xs text-ctp-red"
          >
            Fix the errors below before saving.
          </div>

          <div class="space-y-1">
            <div
              v-for="(fn, idx) in draftFunctions"
              :key="idx"
              class="flex items-center gap-2 rounded-lg border px-3 py-2"
              :class="fnErrors[fn.name] ? 'border-ctp-red' : 'border-ctp-surface1'"
            >
              <button
                class="flex-1 text-left font-mono text-xs text-ctp-mauve hover:underline"
                @click="editingFnIdx = idx"
              >
                fn.{{ fn.name || '(unnamed)' }}
              </button>
              <span
                v-if="fn.name && fnErrors[fn.name]"
                class="text-xs text-ctp-red"
                title="Has error"
              >✕</span>
              <span
                v-if="fn.lastError && !fnErrors[fn.name]"
                class="text-xs text-ctp-peach"
                title="Last execution error"
              >⚠</span>
              <button
                class="text-xs text-ctp-subtext0 hover:text-ctp-red"
                @click="removeFunction(idx)"
              >
                Remove
              </button>
            </div>
          </div>
        </div>

        <!-- Signal browser -->
        <SignalBrowser :functions="draftFunctions" />

        <!-- Save / cancel -->
        <div class="flex gap-3">
          <AsyncButton
            :action="save"
            :disabled="!canSave"
            class="rounded-lg bg-ctp-mauve px-4 py-2 text-sm font-medium text-ctp-base hover:opacity-90"
          >
            {{ editingId ? 'Save changes' : 'Create template' }}
          </AsyncButton>
          <button class="text-sm text-ctp-subtext0 hover:text-ctp-text" @click="closeEditor">
            Cancel
          </button>
        </div>
      </div>
    </main>

    <!-- Autocomplete popup (fixed, teleported to body to avoid clipping) -->
    <Teleport to="body">
      <div
        v-if="ac.showPopup.value"
        class="fixed z-50 min-w-56 overflow-hidden rounded-lg border border-ctp-surface1 bg-ctp-base shadow-xl"
        :style="{ left: ac.popupLeft.value + 'px', top: ac.popupTop.value + 'px' }"
      >
        <ul role="listbox">
          <li
            v-for="(c, i) in ac.filtered.value"
            :key="c.token"
            role="option"
            tabindex="-1"
            :aria-selected="i === ac.selectedIdx.value"
            class="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-xs"
            :class="i === ac.selectedIdx.value ? 'bg-ctp-surface1 text-ctp-text' : 'text-ctp-subtext1 hover:bg-ctp-surface0'"
            @mousedown.prevent="ac.accept(c)"
          >
            <code class="text-ctp-mauve">{{ hbsToken(c.token) }}</code>
            <span class="shrink-0 rounded bg-ctp-surface0 px-1 font-mono text-ctp-overlay1">{{ c.type }}</span>
            <span v-if="c.example" class="ml-auto truncate text-ctp-subtext0">{{ c.example }}</span>
          </li>
        </ul>
      </div>
    </Teleport>
  </div>
</template>

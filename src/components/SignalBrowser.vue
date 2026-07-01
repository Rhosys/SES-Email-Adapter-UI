<script setup lang="ts">
import { ref } from 'vue'
import type { TemplateFunction } from '@/types/server'

const props = defineProps<{ functions?: TemplateFunction[] }>()

const expanded = ref(true)
const copied = ref<string | null>(null)

interface PropInfo {
  path: string
  type: string
  example: string
  note?: string
}

const SIGNAL_PROPS: PropInfo[] = [
  { path: 'signal.data.from.name', type: 'string', example: 'Jane Smith', note: 'May be empty' },
  { path: 'signal.data.from.address', type: 'string', example: 'jane@example.com' },
  { path: 'signal.data.to[0].address', type: 'string', example: 'you@yourdomain.com', note: 'First recipient' },
  { path: 'signal.data.subject', type: 'string', example: 'Quick question about your service' },
  { path: 'signal.data.body', type: 'string?', example: 'Hi, I have a question…', note: 'Plain-text body' },
  { path: 'signal.data.receivedAt', type: 'ISO string', example: new Date().toISOString().slice(0, 19) + 'Z' },
  { path: 'signal.data.spamScore', type: 'number?', example: '0.02', note: '0 = clean, 1 = spam' },
]

const THREAD_PROPS: PropInfo[] = [
  { path: 'thread.workflow', type: 'string', example: 'conversation', note: 'auth | conversation | crm | package | travel…' },
  { path: 'thread.summary', type: 'string', example: 'Customer asking about order #12345', note: 'AI summary' },
  { path: 'thread.urgency', type: 'string', example: 'normal', note: 'critical | high | normal | low | silent' },
  { path: 'thread.status', type: 'string', example: 'active', note: 'active | archived | deleted' },
  { path: 'thread.labels', type: 'string[]', example: '[]', note: 'Applied label IDs' },
]

function hbsFn(name: string) {
  return '{{fn.' + name + '}}'
}

function copyPath(path: string) {
  navigator.clipboard.writeText(path).then(() => {
    copied.value = path
    setTimeout(() => { copied.value = null }, 1500)
  })
}
</script>

<template>
  <div class="rounded-lg border border-ctp-surface1 bg-ctp-mantle text-xs">
    <button
      class="flex w-full items-center justify-between px-3 py-2.5 text-left text-ctp-subtext1 hover:text-ctp-text"
      @click="expanded = !expanded"
    >
      <span class="font-medium text-ctp-text">Signal &amp; Thread properties</span>
      <span class="ml-2 text-ctp-surface2">
        {{ expanded ? '▲ hide' : '▼ show' }}
      </span>
    </button>

    <div v-if="expanded" class="border-t border-ctp-surface0 px-3 pb-3 pt-2">
      <p class="mb-3 text-ctp-subtext0">
        Use these in your function code. Click any path to copy it.
      </p>

      <!-- Signal props -->
      <p class="mb-1.5 font-medium text-ctp-text">signal</p>
      <div class="mb-3 space-y-1">
        <button
          v-for="p in SIGNAL_PROPS"
          :key="p.path"
          class="flex w-full items-start gap-2 rounded px-1.5 py-1 text-left hover:bg-ctp-surface0 active:bg-ctp-surface1"
          @click="copyPath(p.path)"
        >
          <code class="shrink-0 text-ctp-blue">{{ p.path }}</code>
          <span class="shrink-0 rounded bg-ctp-surface0 px-1 font-mono text-ctp-overlay1">{{ p.type }}</span>
          <span class="min-w-0 truncate text-ctp-subtext0">{{ p.note ?? p.example }}</span>
          <span v-if="copied === p.path" class="ml-auto shrink-0 text-ctp-green">copied!</span>
        </button>
      </div>

      <!-- Thread props -->
      <p class="mb-1.5 font-medium text-ctp-text">thread</p>
      <div class="mb-3 space-y-1">
        <button
          v-for="p in THREAD_PROPS"
          :key="p.path"
          class="flex w-full items-start gap-2 rounded px-1.5 py-1 text-left hover:bg-ctp-surface0 active:bg-ctp-surface1"
          @click="copyPath(p.path)"
        >
          <code class="shrink-0 text-ctp-blue">{{ p.path }}</code>
          <span class="shrink-0 rounded bg-ctp-surface0 px-1 font-mono text-ctp-overlay1">{{ p.type }}</span>
          <span class="min-w-0 truncate text-ctp-subtext0">{{ p.note ?? p.example }}</span>
          <span v-if="copied === p.path" class="ml-auto shrink-0 text-ctp-green">copied!</span>
        </button>
      </div>

      <!-- Dynamic fn outputs -->
      <template v-if="props.functions && props.functions.length > 0">
        <p class="mb-1.5 font-medium text-ctp-text">fn (template variables)</p>
        <div class="space-y-1">
          <div
            v-for="fn in props.functions"
            :key="fn.name"
            class="flex items-center gap-2 rounded px-1.5 py-1"
          >
            <code class="shrink-0 text-ctp-mauve">{{ hbsFn(fn.name || '…') }}</code>
            <span class="shrink-0 rounded bg-ctp-surface0 px-1 font-mono text-ctp-overlay1">string</span>
            <span class="min-w-0 truncate text-ctp-subtext0">return value from your function</span>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

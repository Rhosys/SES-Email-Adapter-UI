<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { EditorView, basicSetup } from 'codemirror'
import { EditorState } from '@codemirror/state'
import { javascript, javascriptLanguage } from '@codemirror/lang-javascript'
import type { CompletionContext, CompletionResult } from '@codemirror/autocomplete'

const props = defineProps<{
  modelValue: string
  minHeight?: string
  signalCompletions?: boolean
}>()

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const container = ref<HTMLElement | null>(null)
let view: EditorView | null = null

// Catppuccin Mocha theme
const catppuccinTheme = EditorView.theme(
  {
    '&': {
      color: '#cdd6f4',
      backgroundColor: '#1e1e2e',
      borderRadius: '0.375rem',
      fontSize: '0.75rem',
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    },
    '.cm-content': { caretColor: '#cba6f7', padding: '8px 0' },
    '.cm-cursor': { borderLeftColor: '#cba6f7' },
    '.cm-focused .cm-selectionBackground, ::selection': { backgroundColor: '#45475a' },
    '.cm-selectionBackground': { backgroundColor: '#313244' },
    '.cm-gutters': {
      backgroundColor: '#181825',
      color: '#585b70',
      border: 'none',
      borderRight: '1px solid #313244',
    },
    '.cm-activeLineGutter': { backgroundColor: '#1e1e2e' },
    '.cm-activeLine': { backgroundColor: '#313244/40' },
    '.cm-matchingBracket': { backgroundColor: '#45475a', color: '#cdd6f4' },
    '.cm-lineNumbers': { color: '#585b70' },
    '.cm-foldPlaceholder': { backgroundColor: '#313244', color: '#cdd6f4', border: 'none' },
    // Syntax tokens
    '.tok-keyword': { color: '#cba6f7' },
    '.tok-operator': { color: '#89dceb' },
    '.tok-string': { color: '#a6e3a1' },
    '.tok-string2': { color: '#a6e3a1' },
    '.tok-number': { color: '#fab387' },
    '.tok-bool': { color: '#fab387' },
    '.tok-null': { color: '#fab387' },
    '.tok-comment': { color: '#6c7086', fontStyle: 'italic' },
    '.tok-variableName': { color: '#cdd6f4' },
    '.tok-propertyName': { color: '#89b4fa' },
    '.tok-function': { color: '#89b4fa' },
    '.tok-typeName': { color: '#f5c2e7' },
    '.tok-className': { color: '#f5c2e7' },
    '.tok-punctuation': { color: '#cdd6f4' },
    '.tok-invalid': { color: '#f38ba8' },
    // Completion popup
    '.cm-tooltip.cm-tooltip-autocomplete': {
      backgroundColor: '#1e1e2e',
      border: '1px solid #313244',
      borderRadius: '6px',
    },
    '.cm-tooltip-autocomplete ul li': { color: '#cdd6f4', padding: '2px 8px' },
    '.cm-tooltip-autocomplete ul li[aria-selected]': { backgroundColor: '#313244', color: '#cba6f7' },
    '.cm-completionLabel': { color: '#89b4fa' },
    '.cm-completionDetail': { color: '#6c7086', fontStyle: 'italic' },
  },
  { dark: true },
)

// Signal and thread property completions for function code editors
const SIGNAL_ARC_ITEMS = [
  { label: 'signal', type: 'variable', detail: 'Signal object' },
  { label: 'signal.from', type: 'property', detail: 'EmailAddress' },
  { label: 'signal.from.name', type: 'property', detail: 'string', info: 'Sender display name' },
  { label: 'signal.from.address', type: 'property', detail: 'string', info: 'Sender email address' },
  { label: 'signal.to', type: 'property', detail: 'EmailAddress[]', info: 'Recipients array' },
  { label: 'signal.to[0].address', type: 'property', detail: 'string', info: 'First recipient email' },
  { label: 'signal.subject', type: 'property', detail: 'string', info: 'Email subject line' },
  { label: 'signal.textBody', type: 'property', detail: 'string | undefined', info: 'Plain-text body' },
  { label: 'signal.htmlBody', type: 'property', detail: 'string | undefined', info: 'HTML body' },
  { label: 'signal.receivedAt', type: 'property', detail: 'string', info: 'ISO timestamp' },
  { label: 'signal.spamScore', type: 'property', detail: 'number | undefined', info: '0 = clean, 1 = spam' },
  { label: 'signal.workflowData', type: 'property', detail: 'WorkflowData | undefined' },
  { label: 'arc', type: 'variable', detail: 'Arc object' },
  { label: 'arc.workflow', type: 'property', detail: 'string', info: 'conversation | auth | crm | package…' },
  { label: 'arc.summary', type: 'property', detail: 'string', info: 'AI-generated thread summary' },
  { label: 'arc.urgency', type: 'property', detail: 'string', info: 'critical | high | normal | low | silent' },
  { label: 'arc.status', type: 'property', detail: 'string', info: 'active | archived | deleted' },
  { label: 'arc.labels', type: 'property', detail: 'string[]', info: 'Applied label IDs' },
  { label: 'arc.lastSignalAt', type: 'property', detail: 'string', info: 'ISO timestamp of last activity' },
]

function makeSignalCompletions(context: CompletionContext): CompletionResult | null {
  const word = context.matchBefore(/[\w.[\]]+/)
  if (!word || (word.from === word.to && !context.explicit)) return null
  const q = word.text.toLowerCase()
  const options = SIGNAL_ARC_ITEMS.filter(
    (item) => item.label.toLowerCase().startsWith(q) || item.label.toLowerCase().includes(q),
  )
  if (options.length === 0) return null
  return { from: word.from, options, validFor: /^[\w.[\]]*$/ }
}

onMounted(() => {
  if (!container.value) return

  const extensions = [
    basicSetup,
    javascript(),
    catppuccinTheme,
    EditorView.updateListener.of((update) => {
      if (update.docChanged) emit('update:modelValue', update.state.doc.toString())
    }),
  ]

  if (props.signalCompletions) {
    extensions.push(javascriptLanguage.data.of({ autocomplete: makeSignalCompletions }))
  }

  const state = EditorState.create({ doc: props.modelValue, extensions })
  view = new EditorView({ state, parent: container.value })
})

onBeforeUnmount(() => {
  view?.destroy()
  view = null
})

// Sync external value changes into the editor
watch(
  () => props.modelValue,
  (val) => {
    if (!view) return
    const current = view.state.doc.toString()
    if (current !== val) {
      view.dispatch({ changes: { from: 0, to: current.length, insert: val } })
    }
  },
)
</script>

<template>
  <div
    ref="container"
    class="overflow-hidden rounded-lg border border-ctp-surface1 focus-within:border-ctp-mauve"
    :style="{ minHeight: minHeight ?? '8rem' }"
  />
</template>

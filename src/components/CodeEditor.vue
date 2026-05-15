<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { EditorView, basicSetup } from 'codemirror'
import { EditorState } from '@codemirror/state'
import { javascript } from '@codemirror/lang-javascript'

const props = defineProps<{
  modelValue: string
  minHeight?: string
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
    '.tok-keyword': { color: '#cba6f7' },        // mauve
    '.tok-operator': { color: '#89dceb' },        // sky
    '.tok-string': { color: '#a6e3a1' },          // green
    '.tok-string2': { color: '#a6e3a1' },
    '.tok-number': { color: '#fab387' },          // peach
    '.tok-bool': { color: '#fab387' },
    '.tok-null': { color: '#fab387' },
    '.tok-comment': { color: '#6c7086', fontStyle: 'italic' },
    '.tok-variableName': { color: '#cdd6f4' },
    '.tok-propertyName': { color: '#89b4fa' },    // blue
    '.tok-function': { color: '#89b4fa' },
    '.tok-typeName': { color: '#f5c2e7' },        // pink
    '.tok-className': { color: '#f5c2e7' },
    '.tok-punctuation': { color: '#cdd6f4' },
    '.tok-invalid': { color: '#f38ba8' },         // red
  },
  { dark: true },
)

onMounted(() => {
  if (!container.value) return

  const state = EditorState.create({
    doc: props.modelValue,
    extensions: [
      basicSetup,
      javascript(),
      catppuccinTheme,
      EditorView.updateListener.of((update) => {
        if (update.docChanged) emit('update:modelValue', update.state.doc.toString())
      }),
    ],
  })

  view = new EditorView({ state, parent: container.value })
})

onBeforeUnmount(() => {
  view?.destroy()
  view = null
})

// Sync external value changes into the editor (e.g. when openEdit loads a template)
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

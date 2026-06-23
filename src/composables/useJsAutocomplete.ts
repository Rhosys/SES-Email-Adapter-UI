import { ref, computed } from 'vue'
import getCaretCoordinates from 'textarea-caret'

export interface JsCompletion {
  path: string      // full dot path e.g. "signal.from.address"
  label: string     // display label
  type: string      // e.g. "string", "number", "string[]"
  example?: string  // sample value
}

const SIGNAL_COMPLETIONS: JsCompletion[] = [
  { path: 'signal.from.address', label: 'from.address', type: 'string', example: 'jane@example.com' },
  { path: 'signal.from.domain', label: 'from.domain', type: 'string', example: 'example.com' },
  { path: 'signal.from.name', label: 'from.name', type: 'string', example: 'Jane Smith' },
  { path: 'signal.subject', label: 'subject', type: 'string', example: 'Quick question' },
  { path: 'signal.workflow', label: 'workflow', type: 'string', example: 'conversation' },
  { path: 'signal.spamScore', label: 'spamScore', type: 'number', example: '0.02' },
  { path: 'signal.type', label: 'type', type: 'string', example: 'email' },
]

const ARC_COMPLETIONS: JsCompletion[] = [
  { path: 'arc.workflow', label: 'workflow', type: 'string', example: 'conversation' },
  { path: 'arc.summary', label: 'summary', type: 'string', example: 'Customer asking about order' },
  { path: 'arc.urgency', label: 'urgency', type: 'string', example: 'normal' },
  { path: 'arc.status', label: 'status', type: 'string', example: 'active' },
  { path: 'arc.labels', label: 'labels', type: 'string[]', example: '[]' },
]

const METHOD_COMPLETIONS: JsCompletion[] = [
  { path: '.includes(', label: '.includes(value)', type: 'method', example: 'true/false' },
  { path: '.startsWith(', label: '.startsWith(prefix)', type: 'method', example: 'true/false' },
  { path: '.endsWith(', label: '.endsWith(suffix)', type: 'method', example: 'true/false' },
  { path: '.toLowerCase()', label: '.toLowerCase()', type: 'method', example: '"hello"' },
  { path: '.split(', label: '.split(separator)', type: 'method', example: '["a","b"]' },
  { path: '.length', label: '.length', type: 'number', example: '5' },
]

export function useJsAutocomplete() {
  const showPopup = ref(false)
  const popupLeft = ref(0)
  const popupTop = ref(0)
  const selectedIdx = ref(0)
  const partial = ref('')
  const completionType = ref<'property' | 'method'>('property')

  let _el: HTMLTextAreaElement | null = null
  let _insertStart = 0

  const allCompletions = computed(() => {
    if (completionType.value === 'method') return METHOD_COMPLETIONS
    return [...SIGNAL_COMPLETIONS, ...ARC_COMPLETIONS]
  })

  const filtered = computed(() => {
    const q = partial.value.toLowerCase()
    return allCompletions.value
      .filter((c) => !q || c.path.toLowerCase().includes(q) || c.label.toLowerCase().includes(q))
      .slice(0, 8)
  })

  function _refresh(el: HTMLTextAreaElement) {
    const pos = el.selectionStart ?? 0
    const before = el.value.slice(0, pos)

    // Check for string method trigger (after a known string property)
    const methodMatch = before.match(/(?:signal\.(?:from\.(?:address|domain|name)|subject|workflow|type)|arc\.(?:workflow|summary|urgency|status))(\.)([a-zA-Z]*)$/)
    // Check for "signal." or "arc." trigger
    const signalMatch = before.match(/(signal\.)([a-zA-Z.]*)$/)
    const arcMatch = before.match(/(arc\.)([a-zA-Z.]*)$/)

    if (methodMatch) {
      completionType.value = 'method'
      _insertStart = pos - methodMatch[2].length - 1 // include the dot
      partial.value = '.' + methodMatch[2]
    } else if (signalMatch) {
      completionType.value = 'property'
      _insertStart = pos - signalMatch[0].length
      partial.value = signalMatch[0]
    } else if (arcMatch) {
      completionType.value = 'property'
      _insertStart = pos - arcMatch[0].length
      partial.value = arcMatch[0]
    } else {
      showPopup.value = false
      return
    }

    _el = el
    selectedIdx.value = 0

    if (filtered.value.length === 0) { showPopup.value = false; return }

    const coords = getCaretCoordinates(el, pos)
    const rect = el.getBoundingClientRect()
    popupLeft.value = Math.round(rect.left + coords.left - el.scrollLeft)
    popupTop.value = Math.round(rect.top + coords.top - el.scrollTop + coords.height + 4)
    showPopup.value = true
  }

  function onInput(e: Event) {
    _refresh(e.target as HTMLTextAreaElement)
  }

  function onKeydown(e: KeyboardEvent) {
    if (!showPopup.value || filtered.value.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      selectedIdx.value = (selectedIdx.value + 1) % filtered.value.length
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      selectedIdx.value = (selectedIdx.value - 1 + filtered.value.length) % filtered.value.length
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      accept(filtered.value[selectedIdx.value])
    } else if (e.key === 'Escape') {
      showPopup.value = false
    }
  }

  function accept(completion: JsCompletion) {
    const el = _el
    if (!el) return
    const curPos = el.selectionStart ?? 0
    const before = el.value.slice(0, _insertStart)
    const rest = el.value.slice(curPos)
    const inserted = completion.path
    el.value = before + inserted + rest
    const newPos = before.length + inserted.length
    el.setSelectionRange(newPos, newPos)
    el.dispatchEvent(new Event('input', { bubbles: true }))
    showPopup.value = false
  }

  function close() {
    showPopup.value = false
  }

  return { showPopup, popupLeft, popupTop, selectedIdx, filtered, onInput, onKeydown, accept, close }
}

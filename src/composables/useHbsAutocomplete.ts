import { ref, computed } from 'vue'
import getCaretCoordinates from 'textarea-caret'

export interface HbsCompletion {
  token: string     // inserted as {{token}}
  label: string     // display label
  type: string      // e.g. "string" or "function"
  example?: string  // sample value shown in popup
}

export function useHbsAutocomplete(completions: () => HbsCompletion[]) {
  const showPopup = ref(false)
  const popupLeft = ref(0)
  const popupTop = ref(0)
  const selectedIdx = ref(0)
  const partial = ref('')

  let _el: HTMLInputElement | HTMLTextAreaElement | null = null
  let _openAt = 0 // index of the '{{' in el.value

  const filtered = computed(() => {
    const q = partial.value.toLowerCase()
    return completions()
      .filter((c) => !q || c.token.toLowerCase().startsWith(q) || c.token.toLowerCase().includes(q))
      .slice(0, 8)
  })

  function _refresh(el: HTMLInputElement | HTMLTextAreaElement) {
    const pos = el.selectionStart ?? 0
    const before = el.value.slice(0, pos)
    const lastOpen = before.lastIndexOf('{{')

    if (lastOpen === -1) { showPopup.value = false; return }

    const afterBraces = before.slice(lastOpen + 2)
    // Bail if already closed or partial has a space (invalid token)
    if (afterBraces.includes('}}') || afterBraces.includes(' ')) {
      showPopup.value = false
      return
    }

    _el = el
    _openAt = lastOpen
    partial.value = afterBraces
    selectedIdx.value = 0

    if (filtered.value.length === 0) { showPopup.value = false; return }

    const coords = getCaretCoordinates(el, lastOpen + 2)
    const rect = el.getBoundingClientRect()
    popupLeft.value = Math.round(rect.left + coords.left - el.scrollLeft)
    popupTop.value = Math.round(rect.top + coords.top - el.scrollTop + coords.height + 4)
    showPopup.value = true
  }

  function onInput(e: Event) {
    _refresh(e.target as HTMLInputElement | HTMLTextAreaElement)
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

  function accept(completion: HbsCompletion) {
    const el = _el
    if (!el) return
    const curPos = el.selectionStart ?? 0
    const before = el.value.slice(0, _openAt)
    const rest = el.value.slice(curPos)
    const inserted = `{{${completion.token}}}`
    el.value = before + inserted + rest
    const newPos = before.length + inserted.length
    el.setSelectionRange(newPos, newPos)
    // Trigger Vue's v-model binding
    el.dispatchEvent(new Event('input', { bubbles: true }))
    showPopup.value = false
  }

  function close() {
    showPopup.value = false
  }

  return { showPopup, popupLeft, popupTop, selectedIdx, filtered, onInput, onKeydown, accept, close }
}

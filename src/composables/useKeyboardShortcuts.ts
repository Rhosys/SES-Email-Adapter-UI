import { useShortcutsStore } from '@/stores/shortcuts'
import type { ShortcutAction, KeyBinding } from '@/stores/shortcuts'

// Module-level singleton — one listener, one handler registry, shared across all callers.
// Pattern mirrors useToast.ts.

const handlers = new Map<ShortcutAction, Set<() => void>>()
let pendingPrefix: string | null = null
let prefixTimeout: ReturnType<typeof setTimeout> | null = null
let capturingShortcut = false // true while ShortcutHelpOverlay captures a key press
let blocked = false // true while a modal (e.g. ShortcutHelpOverlay) is open
let initialized = false
let store: ReturnType<typeof useShortcutsStore> | null = null

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  const tag = target.tagName.toLowerCase()
  return (
    tag === 'input' ||
    tag === 'textarea' ||
    tag === 'select' ||
    target.hasAttribute('contenteditable')
  )
}

function bindingMatches(e: KeyboardEvent, b: KeyBinding): boolean {
  return (
    e.key === b.key &&
    !!b.shift === e.shiftKey &&
    !!b.ctrl === e.ctrlKey &&
    !!b.alt === e.altKey &&
    !!b.meta === e.metaKey
  )
}

function dispatch(action: ShortcutAction) {
  handlers.get(action)?.forEach((h) => h())
}

function handleKeydown(e: KeyboardEvent) {
  if (capturingShortcut) return
  if (isTypingTarget(e.target)) return

  const effective = store?.effectiveShortcuts ?? {}

  // When blocked (modal open), only allow toggling the shortcut help overlay
  if (blocked) {
    const helpBinding = effective.shortcut_help
    if (helpBinding && bindingMatches(e, helpBinding) && !helpBinding.prefix) {
      e.preventDefault()
      dispatch('shortcut_help')
    }
    return
  }

  // Resolve pending two-key sequence (g → i, etc.)
  if (pendingPrefix !== null) {
    const prefix = pendingPrefix
    clearTimeout(prefixTimeout!)
    pendingPrefix = null
    prefixTimeout = null

    for (const [action, binding] of Object.entries(effective) as [ShortcutAction, KeyBinding][]) {
      if (binding.prefix === prefix && bindingMatches(e, binding)) {
        e.preventDefault()
        dispatch(action)
        return
      }
    }
    // No sequence match — let the key propagate
    return
  }

  // Detect if this key could start a two-key sequence (e.g. 'g')
  const prefixKeys = new Set<string>()
  for (const binding of Object.values(effective) as KeyBinding[]) {
    if (binding.prefix) prefixKeys.add(binding.prefix)
  }
  if (prefixKeys.has(e.key) && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
    e.preventDefault()
    pendingPrefix = e.key
    prefixTimeout = setTimeout(() => {
      pendingPrefix = null
      prefixTimeout = null
    }, 500)
    return
  }

  // Regular single-key bindings
  for (const [action, binding] of Object.entries(effective) as [ShortcutAction, KeyBinding][]) {
    if (binding.prefix) continue
    if (bindingMatches(e, binding)) {
      e.preventDefault()
      dispatch(action)
      return
    }
  }
}

export function useKeyboardShortcuts() {
  function init() {
    if (initialized) return
    initialized = true
    store = useShortcutsStore()
    store.hydrate()
    document.addEventListener('keydown', handleKeydown, { capture: true })
  }

  function onAction(action: ShortcutAction, handler: () => void) {
    if (!handlers.has(action)) handlers.set(action, new Set())
    handlers.get(action)!.add(handler)
  }

  function offAction(action: ShortcutAction, handler: () => void) {
    handlers.get(action)?.delete(handler)
  }

  function setCapturing(capturing: boolean) {
    capturingShortcut = capturing
  }

  function setBlocked(value: boolean) {
    blocked = value
  }

  return { init, onAction, offAction, setCapturing, setBlocked }
}

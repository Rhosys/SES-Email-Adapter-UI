import { describe, it, expect, vi, beforeAll } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts'

function setViewportWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', { value: width, writable: true, configurable: true })
}

function pressShortcutHelp() {
  const event = new KeyboardEvent('keydown', { key: '?', shiftKey: true, cancelable: true })
  document.dispatchEvent(event)
}

describe('useKeyboardShortcuts — disabled below the mobile breakpoint', () => {
  // The module holds module-level singleton state (`initialized`, the
  // document listener) that only attaches once per test run, so init() is
  // called a single time here and all cases share it — matching how the app
  // itself only calls init() once per page load.
  beforeAll(() => {
    setActivePinia(createPinia())
    const { init } = useKeyboardShortcuts()
    init()
  })

  it('dispatches the shortcut_help action on desktop widths', () => {
    setViewportWidth(1280)
    const { onAction, offAction } = useKeyboardShortcuts()
    const handler = vi.fn()
    onAction('shortcut_help', handler)
    pressShortcutHelp()
    offAction('shortcut_help', handler)
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('does not dispatch any shortcut below the sm breakpoint', () => {
    setViewportWidth(375)
    const { onAction, offAction } = useKeyboardShortcuts()
    const handler = vi.fn()
    onAction('shortcut_help', handler)
    pressShortcutHelp()
    offAction('shortcut_help', handler)
    expect(handler).not.toHaveBeenCalled()
  })

  it('re-checks the viewport live rather than caching it at init time', () => {
    setViewportWidth(375)
    const { onAction, offAction } = useKeyboardShortcuts()
    const handler = vi.fn()
    onAction('shortcut_help', handler)

    pressShortcutHelp()
    expect(handler).not.toHaveBeenCalled()

    setViewportWidth(1280)
    pressShortcutHelp()
    expect(handler).toHaveBeenCalledTimes(1)

    offAction('shortcut_help', handler)
  })
})

describe('useKeyboardShortcuts — shared shortcutHelpOpen', () => {
  it('is the same ref across every caller, so there is one overlay instance for the whole app', () => {
    const a = useKeyboardShortcuts()
    const b = useKeyboardShortcuts()
    expect(a.shortcutHelpOpen).toBe(b.shortcutHelpOpen)

    a.shortcutHelpOpen.value = true
    expect(b.shortcutHelpOpen.value).toBe(true)

    b.shortcutHelpOpen.value = false
    expect(a.shortcutHelpOpen.value).toBe(false)
  })
})

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import logger from '@/lib/logger'

export type ShortcutAction =
  | 'navigate_next'
  | 'navigate_prev'
  | 'open_thread'
  | 'select_toggle'
  | 'archive'
  | 'delete'
  | 'reply'
  | 'reply_all'
  | 'forward'
  | 'mute'
  | 'star'
  | 'mark_read'
  | 'mark_unread'
  | 'compose'
  | 'search'
  | 'shortcut_help'
  | 'go_inbox'
  | 'go_drafts'
  | 'go_starred'
  | 'go_quarantine'
  | 'go_labels'
  | 'go_rules'
  | 'go_settings'
  | 'go_profile'

export interface KeyBinding {
  key: string
  shift?: boolean
  ctrl?: boolean
  alt?: boolean
  meta?: boolean
  prefix?: string
}

export type PresetId = 'default' | 'gmail' | 'superhuman' | 'spark' | 'fastmail'

const k = (key: string, mods?: Partial<Omit<KeyBinding, 'key'>>): KeyBinding => ({ key, ...mods })
const seq = (prefix: string, key: string): KeyBinding => ({ key, prefix })

// Three-letter note on key values:
//  e.key reports the produced character, not the physical key.
//  '#' = Shift+3, '?' = Shift+/, '>' = Shift+. on US layout.
//  shiftKey must be set whenever the key itself requires Shift.
export const PRESETS: Record<PresetId, Partial<Record<ShortcutAction, KeyBinding>>> = {
  // Default — Gmail-style single-key shortcuts, the widest-known model
  default: {
    navigate_next: k('j'),
    navigate_prev: k('k'),
    open_thread: k('Enter'),
    select_toggle: k('x'),
    archive: k('e'),
    delete: k('#', { shift: true }),
    reply: k('r'),
    reply_all: k('a'),
    forward: k('f'),
    mute: k('m'),
    star: k('s'),
    mark_read: k('I', { shift: true }),
    mark_unread: k('U', { shift: true }),
    compose: k('c'),
    search: k('/'),
    shortcut_help: k('?', { shift: true }),
    go_inbox: seq('g', 'i'),
    go_quarantine: seq('g', 'q'),
    go_labels: seq('g', 'l'),
    go_rules: seq('g', 'r'),
    go_settings: seq('g', ','),
    go_profile: seq('g', 'p'),
    go_drafts: seq('g', 'd'),
    go_starred: seq('g', 's'),
  },

  // Gmail — exact Gmail web shortcuts (o to open instead of Enter)
  gmail: {
    navigate_next: k('j'),
    navigate_prev: k('k'),
    open_thread: k('o'),
    select_toggle: k('x'),
    archive: k('e'),
    delete: k('#', { shift: true }),
    reply: k('r'),
    reply_all: k('a'),
    forward: k('f'),
    mute: k('m'),
    star: k('s'),
    mark_read: k('I', { shift: true }),
    mark_unread: k('U', { shift: true }),
    compose: k('c'),
    search: k('/'),
    shortcut_help: k('?', { shift: true }),
    go_inbox: seq('g', 'i'),
    go_drafts: seq('g', 'd'),
    go_starred: seq('g', 's'),
    go_labels: seq('g', 'l'),
    go_quarantine: seq('g', 'q'),
    go_rules: seq('g', 'r'),
    go_settings: seq('g', ','),
    go_profile: seq('g', 'p'),
  },

  // Superhuman — d for delete, p for pin (star), . / > for read/unread
  superhuman: {
    navigate_next: k('j'),
    navigate_prev: k('k'),
    open_thread: k('Enter'),
    select_toggle: k('x'),
    archive: k('e'),
    delete: k('d'),
    reply: k('r'),
    reply_all: k('a'),
    forward: k('f'),
    mute: k('m'),
    star: k('p'),
    mark_read: k('.'),
    mark_unread: k('>', { shift: true }),
    compose: k('c'),
    search: k('/'),
    shortcut_help: k('?', { shift: true }),
    go_inbox: seq('g', 'i'),
    go_drafts: seq('g', 'd'),
    go_starred: seq('g', 's'),
    go_labels: seq('g', 'l'),
    go_quarantine: seq('g', 'q'),
    go_rules: seq('g', 'r'),
    go_settings: seq('g', ','),
    go_profile: seq('g', 'p'),
  },

  // Spark (Readdle) — d for delete, s for star, . for read like Superhuman
  spark: {
    navigate_next: k('j'),
    navigate_prev: k('k'),
    open_thread: k('Enter'),
    select_toggle: k('x'),
    archive: k('e'),
    delete: k('d'),
    reply: k('r'),
    reply_all: k('a'),
    forward: k('f'),
    mute: k('m'),
    star: k('s'),
    mark_read: k('.'),
    mark_unread: k('>', { shift: true }),
    compose: k('c'),
    search: k('/'),
    shortcut_help: k('?', { shift: true }),
    go_inbox: seq('g', 'i'),
    go_drafts: seq('g', 'd'),
    go_starred: seq('g', 's'),
    go_labels: seq('g', 'l'),
    go_quarantine: seq('g', 'q'),
    go_rules: seq('g', 'r'),
    go_settings: seq('g', ','),
    go_profile: seq('g', 'p'),
  },

  // Fastmail web — o to open like Gmail, Delete key for delete
  fastmail: {
    navigate_next: k('j'),
    navigate_prev: k('k'),
    open_thread: k('o'),
    select_toggle: k('x'),
    archive: k('e'),
    delete: k('Delete'),
    reply: k('r'),
    reply_all: k('a'),
    forward: k('f'),
    mute: k('m'),
    star: k('s'),
    mark_read: k('I', { shift: true }),
    mark_unread: k('U', { shift: true }),
    compose: k('c'),
    search: k('/'),
    shortcut_help: k('?', { shift: true }),
    go_inbox: seq('g', 'i'),
    go_drafts: seq('g', 'd'),
    go_starred: seq('g', 's'),
    go_labels: seq('g', 'l'),
    go_quarantine: seq('g', 'q'),
    go_rules: seq('g', 'r'),
    go_settings: seq('g', ','),
    go_profile: seq('g', 'p'),
  },
}

export const PRESET_LABELS: Record<PresetId, string> = {
  default: 'Default',
  gmail: 'Gmail',
  superhuman: 'Superhuman',
  spark: 'Spark',
  fastmail: 'Fastmail',
}

export const ACTION_LABELS: Record<ShortcutAction, string> = {
  navigate_next: 'Next thread',
  navigate_prev: 'Previous thread',
  open_thread: 'Open thread',
  select_toggle: 'Select / deselect',
  archive: 'Archive',
  delete: 'Delete',
  reply: 'Reply',
  reply_all: 'Reply all',
  forward: 'Forward',
  mute: 'Mute thread',
  star: 'Star / pin',
  mark_read: 'Mark as read',
  mark_unread: 'Mark as unread',
  compose: 'Compose',
  search: 'Search',
  shortcut_help: 'Show shortcuts',
  go_inbox: 'Go to inbox',
  go_drafts: 'Go to drafts',
  go_starred: 'Go to starred',
  go_quarantine: 'Go to quarantine',
  go_labels: 'Go to labels',
  go_rules: 'Go to rules',
  go_settings: 'Go to settings',
  go_profile: 'Go to profile',
}

const STORAGE_KEY = 'ses-ui.shortcuts'

function readStored(): Partial<Record<ShortcutAction, KeyBinding | null>> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as Partial<Record<ShortcutAction, KeyBinding | null>>
  } catch (e) {
    logger.warn({ title: 'Failed to parse stored keyboard shortcuts', error: e })
    return {}
  }
}

export const useShortcutsStore = defineStore('shortcuts', () => {
  // Flat list of user's saved bindings. Empty = use built-in defaults.
  // null value = explicitly disabled.
  const bindings = ref<Partial<Record<ShortcutAction, KeyBinding | null>>>({})

  // Effective shortcuts = default preset merged with user's bindings
  const effectiveShortcuts = computed<Partial<Record<ShortcutAction, KeyBinding>>>(() => {
    const merged: Partial<Record<ShortcutAction, KeyBinding>> = { ...PRESETS.default }
    for (const [action, binding] of Object.entries(bindings.value) as [
      ShortcutAction,
      KeyBinding | null,
    ][]) {
      if (binding === null) delete merged[action]
      else merged[action] = binding
    }
    return merged
  })

  function hydrate() {
    bindings.value = readStored()
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(bindings.value))
    } catch (e) {
      logger.warn({ title: 'Failed to persist keyboard shortcuts', error: e })
    }
  }

  // Load a full preset — populates bindings with all of the preset's values.
  // Actions missing from the preset are explicitly nulled.
  function loadPreset(preset: PresetId) {
    const p = PRESETS[preset]
    const allActions = new Set([
      ...(Object.keys(PRESETS.default) as ShortcutAction[]),
      ...(Object.keys(p) as ShortcutAction[]),
    ])
    const next: Partial<Record<ShortcutAction, KeyBinding | null>> = {}
    for (const action of allActions) {
      next[action] = p[action] ?? null
    }
    bindings.value = next
    persist()
  }

  function setBinding(action: ShortcutAction, binding: KeyBinding | null) {
    bindings.value = { ...bindings.value, [action]: binding }
    persist()
  }

  function resetBinding(action: ShortcutAction) {
    const next = { ...bindings.value }
    delete next[action]
    bindings.value = next
    persist()
  }

  function resetAll() {
    bindings.value = {}
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch (e) {
      logger.warn({ title: 'Failed to clear stored keyboard shortcuts', error: e })
    }
  }

  function findConflicts(binding: KeyBinding, excludeAction?: ShortcutAction): ShortcutAction[] {
    return (Object.keys(effectiveShortcuts.value) as ShortcutAction[]).filter((action) => {
      if (action === excludeAction) return false
      const b = effectiveShortcuts.value[action]
      if (!b) return false
      return (
        b.key === binding.key &&
        !!b.shift === !!binding.shift &&
        !!b.ctrl === !!binding.ctrl &&
        !!b.alt === !!binding.alt &&
        !!b.meta === !!binding.meta &&
        (b.prefix ?? null) === (binding.prefix ?? null)
      )
    })
  }

  return {
    bindings,
    effectiveShortcuts,
    hydrate,
    loadPreset,
    setBinding,
    resetBinding,
    resetAll,
    findConflicts,
  }
})

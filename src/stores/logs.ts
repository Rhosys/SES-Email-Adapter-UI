/* eslint-disable no-console -- this store backs the app logger's own history
   sink, so its own failure paths log via console directly to avoid a
   load/persist feedback loop through the logger. */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { LogHistoryEntry } from '@/lib/logger'

// A rolling, persisted history of the app's own logs so an investigator can read
// recent activity directly on the device (handy on mobile, where there's no
// console). Fed by logger.setHistorySink (wired in main.ts).
//
// Not account-scoped (logs happen before an account is selected) and not part of
// the account-keyed persistentStorePlugin — persistence is handled here against a
// single fixed key, pruned to the last hour and capped in size.

const STORAGE_KEY = 'ses:logs:v1'
const MAX_AGE_MS = 60 * 60 * 1000 // 1 hour
const MAX_ENTRIES = 500

function prune(list: LogHistoryEntry[]): LogHistoryEntry[] {
  const cutoff = Date.now() - MAX_AGE_MS
  const recent = list.filter((e) => Date.parse(e.timestamp) >= cutoff)
  return recent.length > MAX_ENTRIES ? recent.slice(recent.length - MAX_ENTRIES) : recent
}

function load(): LogHistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? prune(parsed as LogHistoryEntry[]) : []
  } catch (e) {
    console.warn('[logs] Failed to load persisted log history', e)
    return []
  }
}

export const useLogStore = defineStore('logs', () => {
  const entries = ref<LogHistoryEntry[]>(load())

  // Persist is debounced to coalesce bursts — logs can arrive rapidly and we
  // don't want a localStorage write per line.
  let saveTimer: ReturnType<typeof setTimeout> | null = null
  function scheduleSave() {
    if (saveTimer) return
    saveTimer = setTimeout(() => {
      saveTimer = null
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.value))
      } catch (e) {
        // localStorage unavailable or over quota — history stays in-memory only.
        console.warn('[logs] Failed to persist log history', e)
      }
    }, 1000)
  }

  function record(entry: LogHistoryEntry) {
    entries.value.push(entry)
    // Keep unbounded growth in check; prune lazily once we drift past the cap.
    if (entries.value.length > MAX_ENTRIES + 50) entries.value = prune(entries.value)
    scheduleSave()
  }

  function clear() {
    entries.value = []
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null }
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch (e) {
      console.warn('[logs] Failed to clear persisted log history', e)
    }
  }

  /** Entries from the last hour, newest first — for display. */
  const recent = computed(() => prune(entries.value).slice().reverse())

  return { entries, recent, record, clear }
})

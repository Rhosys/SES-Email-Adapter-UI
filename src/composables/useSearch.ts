import { ref, watch, onUnmounted, type Ref } from 'vue'
import { useAccountStore } from '@/stores/account'
import { api } from '@/lib/api'
import type { Thread, Alias, Rule, EmailTemplate } from '@/types/server'

export interface UseSearchOptions {
  mode: 'typeahead' | 'full'
}

export interface SearchResults {
  threads: Thread[]
  aliases: Alias[]
  rules: Rule[]
  templates: EmailTemplate[]
}

export interface UseSearchReturn {
  query: Ref<string>
  results: Ref<SearchResults>
  loading: Ref<boolean>
  searched: Ref<boolean>
  error: Ref<string | null>
  onPaste: (event: ClipboardEvent) => void
}

const DEBOUNCE_MS = 250
const MIN_QUERY_LENGTH = 3
const MAX_QUERY_LENGTH = 64

const TYPEAHEAD_LIMITS = { threads: 4, aliases: 3, rules: 3, templates: 3 } as const
const FULL_LIMITS = { threads: 50, aliases: 50, rules: 50, templates: 50 } as const

// Known ID prefixes that support checksum validation
const ID_PREFIXES = ['thr-', 'sgn-', 'rule-', 'tpl-', 'view-', 'acc-'] as const

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
const BASE58_SET = new Set(BASE58_ALPHABET)
const ACCOUNT_ALPHABET_SET = new Set('abcdefghijklmnopqrstuvwxyz0123456789')

function emptyResults(): SearchResults {
  return { threads: [], aliases: [], rules: [], templates: [] }
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

async function validatePrefixedId(id: string): Promise<boolean> {
  const prefix = ID_PREFIXES.find(p => id.startsWith(p))
  if (!prefix) return false

  const body = id.slice(prefix.length)

  if (prefix === 'acc-') {
    // Account IDs: 13 chars body (10 random + 3 check), all lowercase alphanum
    if (body.length !== 13) return false
    for (const c of body) {
      if (!ACCOUNT_ALPHABET_SET.has(c)) return false
    }
    const rawId = body.slice(0, 10)
    const checkBits = body.slice(10)
    const hash = await sha256Hex(rawId)
    // Convert hex hash to base64 then filter lowercase alphanum — replicate backend logic
    const hashBytes = new Uint8Array(hash.match(/.{2}/g)!.map(b => parseInt(b, 16)))
    const base64 = btoa(String.fromCharCode(...hashBytes))
    const expectedCheckBits = base64.replace(/[^abcdefghijklmnopqrstuvwxyz0123456789]/g, '').slice(0, 3)
    return checkBits === expectedCheckBits
  }

  // Standard IDs: body must be >3 chars, last 3 are check chars
  if (body.length <= 3) return false
  const encoded = body.slice(0, -3)
  const checkChars = body.slice(-3)
  const hash = await sha256Hex(encoded)
  const expectedCheckChars = hash.split('').filter(c => BASE58_SET.has(c)).slice(0, 3).join('')
  return checkChars === expectedCheckChars
}

export function useSearch(opts: UseSearchOptions): UseSearchReturn {
  const accountStore = useAccountStore()
  const limits = opts.mode === 'typeahead' ? TYPEAHEAD_LIMITS : FULL_LIMITS

  const query = ref('')
  const results = ref<SearchResults>(emptyResults())
  const loading = ref(false)
  const searched = ref(false)
  const error = ref<string | null>(null)

  let activeQuery = ''
  let debounceTimer: ReturnType<typeof setTimeout> | null = null

  function clearPending() {
    if (debounceTimer) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }
  }

  function clearResults() {
    results.value = emptyResults()
    searched.value = false
    error.value = null
    activeQuery = ''
  }

  async function executeSearch(q: string) {
    const accountId = accountStore.accountId
    if (!accountId) return

    activeQuery = q
    loading.value = true
    error.value = null

    const [threadsRes, aliasesRes, rulesRes, templatesRes] = await Promise.all([
      api.listThreads(accountId, { q, limit: limits.threads }),
      api.listAliases(accountId),
      api.listRules(accountId),
      api.listTemplates(accountId),
    ])

    // Stale-query guard: discard if a newer query has been issued
    if (activeQuery !== q) return

    loading.value = false
    searched.value = true

    const ql = q.toLowerCase()
    const newResults = emptyResults()

    if (threadsRes.isOk()) {
      newResults.threads = threadsRes.value.threads.slice(0, limits.threads)
    }

    if (aliasesRes.isOk()) {
      newResults.aliases = aliasesRes.value
        .filter(a => a.alias.toLowerCase().includes(ql))
        .slice(0, limits.aliases)
    }

    if (rulesRes.isOk()) {
      newResults.rules = rulesRes.value
        .filter(r => r.name.toLowerCase().includes(ql) || (r.condition ?? '').toLowerCase().includes(ql))
        .slice(0, limits.rules)
    }

    if (templatesRes.isOk()) {
      newResults.templates = templatesRes.value
        .filter(t => t.name.toLowerCase().includes(ql) || t.subject.toLowerCase().includes(ql))
        .slice(0, limits.templates)
    }

    results.value = newResults

    // Report first error encountered
    if (threadsRes.isErr()) error.value = threadsRes.error.message
    else if (aliasesRes.isErr()) error.value = aliasesRes.error.message
    else if (rulesRes.isErr()) error.value = rulesRes.error.message
    else if (templatesRes.isErr()) error.value = templatesRes.error.message
  }

  async function directLookup(id: string): Promise<boolean> {
    const accountId = accountStore.accountId
    if (!accountId) return false

    activeQuery = id
    loading.value = true
    error.value = null
    results.value = emptyResults()

    const prefix = ID_PREFIXES.find(p => id.startsWith(p))
    const newResults = emptyResults()

    if (prefix === 'thr-') {
      const res = await api.getThread(accountId, id)
      if (activeQuery !== id) return false
      if (res.isOk()) newResults.threads = [res.value]
    } else if (prefix === 'sgn-') {
      // Signals are not in the search results category set — fall through to text search
      loading.value = false
      return false
    } else if (prefix === 'rule-') {
      const res = await api.listRules(accountId)
      if (activeQuery !== id) return false
      if (res.isOk()) {
        const match = res.value.find(r => r.ruleId === id)
        if (match) newResults.rules = [match]
      }
    } else if (prefix === 'tpl-') {
      const res = await api.listTemplates(accountId)
      if (activeQuery !== id) return false
      if (res.isOk()) {
        const match = res.value.find(t => t.templateId === id)
        if (match) newResults.templates = [match]
      }
    }

    if (activeQuery !== id) return false

    loading.value = false
    searched.value = true
    results.value = newResults

    const hasResults = newResults.threads.length > 0 ||
      newResults.aliases.length > 0 ||
      newResults.rules.length > 0 ||
      newResults.templates.length > 0

    return hasResults
  }

  watch(query, (raw) => {
    clearPending()

    // Truncate at max length
    const truncated = raw.slice(0, MAX_QUERY_LENGTH)
    if (truncated !== raw) {
      query.value = truncated
      return // watcher will re-fire with truncated value
    }

    const q = truncated.trim()
    if (q.length < MIN_QUERY_LENGTH) {
      clearResults()
      loading.value = false
      return
    }

    debounceTimer = setTimeout(() => {
      void executeSearch(q)
    }, DEBOUNCE_MS)
  })

  function onPaste(event: ClipboardEvent) {
    const pasted = event.clipboardData?.getData('text/plain')?.trim()
    if (!pasted) return

    // Prevent default input from paste — we'll set query manually
    const id = pasted.slice(0, MAX_QUERY_LENGTH)
    query.value = id

    const prefix = ID_PREFIXES.find(p => id.startsWith(p))
    if (!prefix) return // fall through to normal debounced text search

    // Bypass debounce: validate checksum then do direct lookup
    clearPending()

    void (async () => {
      const valid = await validatePrefixedId(id)
      if (!valid) {
        // Invalid checksum — fall through to text search
        if (id.trim().length >= MIN_QUERY_LENGTH) {
          void executeSearch(id.trim())
        }
        return
      }

      const found = await directLookup(id)
      if (!found) {
        // Valid ID but not found — fall through to text search
        if (id.trim().length >= MIN_QUERY_LENGTH) {
          void executeSearch(id.trim())
        }
      }
    })()
  }

  onUnmounted(() => {
    clearPending()
  })

  return { query, results, loading, searched, error, onPaste }
}

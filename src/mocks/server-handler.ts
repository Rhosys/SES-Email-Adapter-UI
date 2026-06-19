/**
 * Server-side mock handler — used by the Vite dev server middleware.
 * No service worker, no MSW, no browser registration.
 * Just matches URL patterns and returns mock JSON.
 */
import { mockAccounts } from './data/accounts'
import { mockArcs } from './data/arcs'
import { mockSignals } from './data/signals'
import { mockRules } from './data/rules'
import { mockLabels } from './data/labels'
import { mockAliases } from './data/aliases'
import { mockDomains } from './data/domains'
import { mockTemplates } from './data/templates'
import { mockTeamMembers } from './data/team'
import { mockQuarantinedSignalsVisible, mockQuarantinedSignalsHidden } from './data/quarantine'
import { mockViews } from './data/views'
import { mockForwardingAddresses } from './data/forwarding'
import { mockAuditEvents } from './data/audit'
import { mockBilling } from './data/billing'

import { mockSenders } from './data/senders'

interface MockResponse {
  status: number
  body: unknown
}

function match(pattern: string, url: string): Record<string, string> | null {
  const patternParts = pattern.split('/')
  const urlParts = url.split('?')[0].split('/')
  if (patternParts.length !== urlParts.length) return null
  const params: Record<string, string> = {}
  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i].startsWith(':')) {
      params[patternParts[i].slice(1)] = urlParts[i]
    } else if (patternParts[i] !== urlParts[i]) {
      return null
    }
  }
  return params
}

export async function handleMockRequest(method: string, url: string): Promise<MockResponse | null> {
  if (method === 'OPTIONS') return { status: 204, body: '' }

  // GET /accounts
  if (method === 'GET' && match('/accounts', url)) {
    return { status: 200, body: { accounts: mockAccounts } }
  }

  // POST /accounts
  if (method === 'POST' && match('/accounts', url)) {
    return { status: 201, body: mockAccounts[0] }
  }

  // GET /accounts/:accountId
  let params = match('/accounts/:accountId', url)
  if (method === 'GET' && params) {
    const account = mockAccounts.find((a) => a.accountId === params!.accountId)
    return account ? { status: 200, body: account } : { status: 404, body: { title: 'Not found' } }
  }

  // PATCH /accounts/:accountId
  if (method === 'PATCH' && match('/accounts/:accountId', url)) {
    return { status: 200, body: mockAccounts[0] }
  }

  // GET /accounts/:accountId/arcs
  if (method === 'GET' && match('/accounts/:accountId/arcs', url)) {
    const qs = url.split('?')[1] ?? ''
    const statusParam = new URLSearchParams(qs).get('status')
    const filtered = statusParam ? mockArcs.filter(a => a.status === statusParam) : mockArcs
    return { status: 200, body: { arcs: filtered, pagination: { cursor: null } } }
  }

  // GET /accounts/:accountId/arcs/:arcId
  params = match('/accounts/:accountId/arcs/:arcId', url)
  if (method === 'GET' && params) {
    const arc = mockArcs.find((a) => a.arcId === params!.arcId) ?? mockArcs[0]
    return { status: 200, body: arc }
  }

  // PATCH /accounts/:accountId/arcs/:arcId
  if (method === 'PATCH' && match('/accounts/:accountId/arcs/:arcId', url)) {
    return { status: 200, body: mockArcs[0] }
  }

  // GET /accounts/:accountId/arcs/:arcId/signals
  if (method === 'GET' && match('/accounts/:accountId/arcs/:arcId/signals', url)) {
    const arcParams = match('/accounts/:accountId/arcs/:arcId/signals', url)!
    const arcSignals = mockSignals[arcParams.arcId] ?? []
    return { status: 200, body: { signals: arcSignals, pagination: { cursor: null } } }
  }

  // GET /accounts/:accountId/signals (quarantine)
  if (method === 'GET' && match('/accounts/:accountId/signals', url)) {
    const urlObj = new URL(url, 'http://localhost')
    const status = urlObj.searchParams.get('status')
    if (status === 'quarantine_hidden') {
      return { status: 200, body: { signals: mockQuarantinedSignalsHidden, pagination: { cursor: null } } }
    }
    return { status: 200, body: { signals: mockQuarantinedSignalsVisible, pagination: { cursor: null } } }
  }

  // GET /accounts/:accountId/rules
  if (method === 'GET' && match('/accounts/:accountId/rules', url)) {
    return { status: 200, body: { rules: mockRules, pagination: { cursor: null } } }
  }

  // GET /accounts/:accountId/labels
  if (method === 'GET' && match('/accounts/:accountId/labels', url)) {
    return { status: 200, body: { labels: mockLabels, pagination: { cursor: null } } }
  }

  // GET /accounts/:accountId/aliases/:address/senders
  if (method === 'GET' && match('/accounts/:accountId/aliases/:address/senders', url)) {
    const senderParams = match('/accounts/:accountId/aliases/:address/senders', url)!
    const address = decodeURIComponent(senderParams.address)
    const senders = mockSenders[address] ?? []
    return { status: 200, body: { senders } }
  }

  // PUT /accounts/:accountId/aliases/:address/senders/:domain
  if (method === 'PUT' && match('/accounts/:accountId/aliases/:address/senders/:domain', url)) {
    const putParams = match('/accounts/:accountId/aliases/:address/senders/:domain', url)!
    const address = decodeURIComponent(putParams.address)
    const senderDomain = decodeURIComponent(putParams.domain)
    const senders = mockSenders[address] ?? []
    const existing = senders.find((s) => s.sender === senderDomain)
    return { status: 200, body: existing ?? { alias: address, sender: senderDomain, policy: 'allow', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } }
  }

  // GET /accounts/:accountId/aliases
  if (method === 'GET' && match('/accounts/:accountId/aliases', url)) {
    return { status: 200, body: { aliases: mockAliases, pagination: { cursor: null } } }
  }

  // GET /accounts/:accountId/domains
  if (method === 'GET' && match('/accounts/:accountId/domains', url)) {
    return { status: 200, body: { domains: mockDomains, pagination: { cursor: null } } }
  }

  // GET /accounts/:accountId/templates
  if (method === 'GET' && match('/accounts/:accountId/templates', url)) {
    return { status: 200, body: { templates: mockTemplates, pagination: { cursor: null } } }
  }

  // GET /accounts/:accountId/users
  if (method === 'GET' && match('/accounts/:accountId/users', url)) {
    return { status: 200, body: { users: mockTeamMembers, pagination: { cursor: null } } }
  }

  // GET /accounts/:accountId/views
  if (method === 'GET' && match('/accounts/:accountId/views', url)) {
    return { status: 200, body: { views: mockViews, pagination: { cursor: null } } }
  }

  // GET /accounts/:accountId/forwarding-addresses
  if (method === 'GET' && match('/accounts/:accountId/forwarding-addresses', url)) {
    return { status: 200, body: { forwardingAddresses: mockForwardingAddresses, pagination: { cursor: null } } }
  }

  // GET /accounts/:accountId/audit
  if (method === 'GET' && match('/accounts/:accountId/audit', url)) {
    return { status: 200, body: { events: mockAuditEvents, pagination: { cursor: null } } }
  }

  // GET /accounts/:accountId/billing
  if (method === 'GET' && match('/accounts/:accountId/billing', url)) {
    return { status: 200, body: mockBilling }
  }

  // POST /accounts/:accountId/signals/:signalId/quarantineResponse
  if (method === 'POST' && url.includes('/quarantineResponse')) {
    const allSignals = Object.values(mockSignals).flat()
    return { status: 200, body: allSignals[0] ?? { signalId: 'sig_1', status: 'block_reject' } }
  }

  // POST /accounts/:accountId/arcs/:arcId/signals — create draft
  if (method === 'POST' && match('/accounts/:accountId/arcs/:arcId/signals', url)) {
    const draftParams = match('/accounts/:accountId/arcs/:arcId/signals', url)!
    return { status: 201, body: {
      signalId: 'sig_draft_' + Date.now(),
      arcId: draftParams.arcId,
      source: 'user',
      status: 'draft',
      type: 'email',
      createdAt: new Date().toISOString(),
      data: { from: { address: 'you@demo.catchmail.app' }, to: [], cc: [], bcc: [], subject: '', body: '', attachments: [], sendInitiatedAt: '' }
    }}
  }

  // POST catch-all for mutation endpoints
  if (method === 'POST') {
    if (url.includes('/rules')) return { status: 201, body: mockRules[0] }
    if (url.includes('/labels')) return { status: 201, body: mockLabels[0] }
    if (url.includes('/aliases')) return { status: 201, body: mockAliases[0] }
    if (url.includes('/domains')) return { status: 201, body: mockDomains[0] }
    if (url.includes('/templates')) return { status: 201, body: mockTemplates[0] }
    if (url.includes('/users')) return { status: 201, body: mockTeamMembers[0] }
    if (url.includes('/forwarding-addresses')) return { status: 201, body: mockForwardingAddresses[0] }
    if (url.includes('/signals')) return { status: 200, body: Object.values(mockSignals).flat()[0] }
    if (url.includes('/billing')) return { status: 200, body: { url: 'https://example.com' } }
  }

  // PATCH catch-all
  if (method === 'PATCH') {
    if (url.includes('/rules/')) {
      const ruleId = url.split('/rules/')[1]?.split('?')[0]
      const rule = mockRules.find(r => r.ruleId === ruleId) ?? mockRules[0]
      return { status: 200, body: rule }
    }
    if (url.includes('/labels/')) return { status: 200, body: mockLabels[0] }
    if (url.includes('/aliases/')) {
      const address = decodeURIComponent(url.split('/aliases/')[1]?.split('?')[0]?.split('/')[0] ?? '')
      const found = mockAliases.find(a => a.address === address) ?? mockAliases[0]
      return { status: 200, body: found }
    }
    if (url.includes('/domains/')) return { status: 200, body: mockDomains[0] }
    if (url.includes('/signals/')) return { status: 200, body: Object.values(mockSignals).flat()[0] }
    if (url.includes('/users/')) return { status: 200, body: mockTeamMembers[0] }
    return { status: 200, body: mockAccounts[0] }
  }

  // PUT catch-all
  if (method === 'PUT') {
    if (url.includes('/templates/')) return { status: 200, body: mockTemplates[0] }
    return { status: 200, body: {} }
  }

  // DELETE catch-all
  if (method === 'DELETE') {
    return { status: 204, body: '' }
  }

  return null
}

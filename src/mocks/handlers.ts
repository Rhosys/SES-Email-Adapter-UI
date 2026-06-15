import { http, HttpResponse } from 'msw'
import { mockAccounts } from './data/accounts'
import { mockArcs } from './data/arcs'
import { mockSignals, mockSystemSignals } from './data/signals'
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

export const handlers = [
  // ─── Accounts ────────────────────────────────────────────────────────────
  http.get('/accounts', () => {
    return HttpResponse.json({ accounts: mockAccounts })
  }),

  http.get('/accounts/:accountId', ({ params }) => {
    const account = mockAccounts.find((a) => a.accountId === params.accountId)
    if (!account) return new HttpResponse(null, { status: 404 })
    return HttpResponse.json(account)
  }),

  http.post('/accounts', async ({ request }) => {
    const body = (await request.json()) as { name: string }
    const newAccount = {
      accountId: `acc_${Date.now()}`,
      name: body.name,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    return HttpResponse.json(newAccount, { status: 201 })
  }),

  http.patch('/accounts/:accountId', async ({ params, request }) => {
    const account = mockAccounts.find((a) => a.accountId === params.accountId)
    if (!account) return new HttpResponse(null, { status: 404 })
    const body = (await request.json()) as Record<string, unknown>
    return HttpResponse.json({ ...account, ...body, updatedAt: new Date().toISOString() })
  }),

  // ─── Arcs ───────────────────────────────────────────────────────────────
  http.get('/accounts/:accountId/arcs', ({ request }) => {
    const url = new URL(request.url)
    const workflow = url.searchParams.get('workflow')
    const status = url.searchParams.get('status')
    let filtered = mockArcs
    if (workflow) filtered = filtered.filter((a) => a.workflow === workflow)
    if (status) filtered = filtered.filter((a) => a.status === status)
    return HttpResponse.json({ arcs: filtered, pagination: { cursor: null } })
  }),

  http.get('/accounts/:accountId/arcs/:arcId', ({ params }) => {
    const arc = mockArcs.find((a) => a.arcId === params.arcId)
    if (!arc) return new HttpResponse(null, { status: 404 })
    return HttpResponse.json(arc)
  }),

  http.patch('/accounts/:accountId/arcs/:arcId', async ({ params, request }) => {
    const arc = mockArcs.find((a) => a.arcId === params.arcId)
    if (!arc) return new HttpResponse(null, { status: 404 })
    const body = (await request.json()) as Record<string, unknown>
    return HttpResponse.json({ ...arc, ...body, updatedAt: new Date().toISOString() })
  }),

  // ─── Signals ────────────────────────────────────────────────────────────
  http.get('/accounts/:accountId/arcs/:arcId/signals', ({ params }) => {
    const arcId = params.arcId as string
    const signals = mockSignals[arcId] ?? []
    return HttpResponse.json({ signals, pagination: { cursor: null } })
  }),

  http.get('/accounts/:accountId/signals', ({ request }) => {
    const url = new URL(request.url)
    const status = url.searchParams.get('status')
    if (status === 'quarantine_hidden') {
      return HttpResponse.json({ signals: mockQuarantinedSignalsHidden, pagination: { cursor: null } })
    }
    if (status?.startsWith('quarantine')) {
      return HttpResponse.json({ signals: mockQuarantinedSignalsVisible, pagination: { cursor: null } })
    }
    return HttpResponse.json({ signals: mockSystemSignals, pagination: { cursor: null } })
  }),

  http.post('/accounts/:accountId/signals/:signalId/quarantineResponse', () => {
    return HttpResponse.json({ signalId: 'sig_quar_1', status: 'active' })
  }),

  http.post('/accounts/:accountId/signals/:signalId/rsvp', () => {
    return HttpResponse.json({ signalId: 'sig_travel1_cal', status: 'active' })
  }),

  http.post('/accounts/:accountId/arcs/:arcId/signals', async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>
    return HttpResponse.json({
      signalId: `sig_draft_${Date.now()}`,
      arcId: 'thr_conv_1',
      source: 'user',
      status: 'draft',
      type: 'email',
      createdAt: new Date().toISOString(),
      data: body,
    }, { status: 201 })
  }),

  http.put('/accounts/:accountId/signals/:signalId', async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>
    return HttpResponse.json({ signalId: 'sig_draft_1', status: 'draft', ...body })
  }),

  http.post('/accounts/:accountId/signals/:signalId/send', () => {
    return HttpResponse.json({ signalId: 'sig_draft_1', status: 'sent' })
  }),

  http.patch('/accounts/:accountId/signals/:signalId', async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>
    return HttpResponse.json({ signalId: 'sig_1', ...body })
  }),

  http.delete('/accounts/:accountId/signals/:signalId', () => {
    return new HttpResponse(null, { status: 204 })
  }),

  // ─── Rules ──────────────────────────────────────────────────────────────
  http.get('/accounts/:accountId/rules', () => {
    return HttpResponse.json({ rules: mockRules, pagination: { cursor: null } })
  }),

  http.post('/accounts/:accountId/rules', async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>
    return HttpResponse.json({
      ruleId: `rule_new_${Date.now()}`,
      ...body,
      status: 'enabled',
      priorityOrder: 200,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }, { status: 201 })
  }),

  http.patch('/accounts/:accountId/rules/:ruleId', async ({ params, request }) => {
    const rule = mockRules.find((r) => r.ruleId === params.ruleId)
    if (!rule) return new HttpResponse(null, { status: 404 })
    const body = (await request.json()) as Record<string, unknown>
    return HttpResponse.json({ ...rule, ...body, updatedAt: new Date().toISOString() })
  }),

  http.delete('/accounts/:accountId/rules/:ruleId', () => {
    return new HttpResponse(null, { status: 204 })
  }),

  // ─── Labels ─────────────────────────────────────────────────────────────
  http.get('/accounts/:accountId/labels', () => {
    return HttpResponse.json({ labels: mockLabels, pagination: { cursor: null } })
  }),

  http.post('/accounts/:accountId/labels', async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>
    return HttpResponse.json({
      label: `lbl_${Date.now()}`,
      ...body,
      createdAt: new Date().toISOString(),
    }, { status: 201 })
  }),

  http.patch('/accounts/:accountId/labels/:labelId', async ({ params, request }) => {
    const label = mockLabels.find((l) => l.label === params.labelId)
    if (!label) return new HttpResponse(null, { status: 404 })
    const body = (await request.json()) as Record<string, unknown>
    return HttpResponse.json({ ...label, ...body })
  }),

  http.delete('/accounts/:accountId/labels/:labelId', () => {
    return new HttpResponse(null, { status: 204 })
  }),

  // ─── Views ──────────────────────────────────────────────────────────────
  http.get('/accounts/:accountId/views', () => {
    return HttpResponse.json({ views: mockViews, pagination: { cursor: null } })
  }),

  http.post('/accounts/:accountId/views', async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>
    return HttpResponse.json({
      viewId: `view_${Date.now()}`,
      ...body,
      labels: [],
      sortField: 'lastSignalAt',
      sortDirection: 'desc',
      position: mockViews.length,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }, { status: 201 })
  }),

  http.patch('/accounts/:accountId/views/:viewId', async ({ params, request }) => {
    const view = mockViews.find((v) => v.viewId === params.viewId)
    if (!view) return new HttpResponse(null, { status: 404 })
    const body = (await request.json()) as Record<string, unknown>
    return HttpResponse.json({ ...view, ...body, updatedAt: new Date().toISOString() })
  }),

  http.delete('/accounts/:accountId/views/:viewId', () => {
    return new HttpResponse(null, { status: 204 })
  }),

  // ─── Aliases ────────────────────────────────────────────────────────────
  http.get('/accounts/:accountId/aliases', () => {
    return HttpResponse.json({ aliases: mockAliases, pagination: { cursor: null } })
  }),

  http.post('/accounts/:accountId/aliases', async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>
    return HttpResponse.json({
      alias: `alias_${Date.now()}`,
      unknownSenderPolicy: 'quarantine_visible',
      ...body,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }, { status: 201 })
  }),

  http.patch('/accounts/:accountId/aliases/:address', async ({ params, request }) => {
    const alias = mockAliases.find((a) => a.address === decodeURIComponent(params.address as string))
    if (!alias) return new HttpResponse(null, { status: 404 })
    const body = (await request.json()) as Record<string, unknown>
    return HttpResponse.json({ ...alias, ...body, updatedAt: new Date().toISOString() })
  }),

  http.delete('/accounts/:accountId/aliases/:address', () => {
    return new HttpResponse(null, { status: 204 })
  }),

  // ─── Alias senders ──────────────────────────────────────────────────────
  http.get('/accounts/:accountId/aliases/:address/senders', () => {
    return HttpResponse.json({ senders: [] })
  }),

  http.post('/accounts/:accountId/aliases/:address/senders', async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>
    return HttpResponse.json({ ...body, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, { status: 201 })
  }),

  http.delete('/accounts/:accountId/aliases/:address/senders/:sender', () => {
    return new HttpResponse(null, { status: 204 })
  }),

  // ─── Domains ────────────────────────────────────────────────────────────
  http.get('/accounts/:accountId/domains', () => {
    return HttpResponse.json({ domains: mockDomains, pagination: { cursor: null } })
  }),

  http.post('/accounts/:accountId/domains', async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>
    return HttpResponse.json({
      domainId: `dom_${Date.now()}`,
      ...body,
      receivingSetupComplete: false,
      senderSetupComplete: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }, { status: 201 })
  }),

  http.patch('/accounts/:accountId/domains/:domainId', ({ params }) => {
    const domain = mockDomains.find((d) => d.domainId === params.domainId)
    if (!domain) return new HttpResponse(null, { status: 404 })
    return HttpResponse.json({ ...domain, updatedAt: new Date().toISOString() })
  }),

  http.delete('/accounts/:accountId/domains/:domainId', () => {
    return new HttpResponse(null, { status: 204 })
  }),

  // ─── Forwarding addresses ──────────────────────────────────────────────
  http.get('/accounts/:accountId/forwarding-addresses', () => {
    return HttpResponse.json({ forwardingAddresses: mockForwardingAddresses, pagination: { cursor: null } })
  }),

  http.post('/accounts/:accountId/forwarding-addresses', async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>
    return HttpResponse.json({
      ...body,
      status: 'pending',
      createdAt: new Date().toISOString(),
    }, { status: 201 })
  }),

  http.delete('/accounts/:accountId/forwarding-addresses/:address', () => {
    return new HttpResponse(null, { status: 204 })
  }),

  // ─── Team members ──────────────────────────────────────────────────────
  http.get('/accounts/:accountId/users', () => {
    return HttpResponse.json({ users: mockTeamMembers, pagination: { cursor: null } })
  }),

  http.post('/accounts/:accountId/users', async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>
    return HttpResponse.json({
      userId: `usr_${Date.now()}`,
      ...body,
    }, { status: 201 })
  }),

  http.patch('/accounts/:accountId/users/:userId', async ({ params, request }) => {
    const member = mockTeamMembers.find((m) => m.userId === params.userId)
    if (!member) return new HttpResponse(null, { status: 404 })
    const body = (await request.json()) as Record<string, unknown>
    return HttpResponse.json({ ...member, ...body })
  }),

  http.delete('/accounts/:accountId/users/:userId', () => {
    return new HttpResponse(null, { status: 204 })
  }),

  // ─── Audit log ─────────────────────────────────────────────────────────
  http.get('/accounts/:accountId/audit', () => {
    return HttpResponse.json({ events: mockAuditEvents, pagination: { cursor: null } })
  }),

  // ─── Billing ───────────────────────────────────────────────────────────
  http.get('/accounts/:accountId/billing', () => {
    return HttpResponse.json(mockBilling)
  }),

  http.post('/accounts/:accountId/billing/checkout-session', () => {
    return HttpResponse.json({ url: 'https://checkout.stripe.com/mock-session' })
  }),

  http.post('/accounts/:accountId/billing/portal-session', () => {
    return HttpResponse.json({ url: 'https://billing.stripe.com/mock-portal' })
  }),

  // ─── Templates ─────────────────────────────────────────────────────────
  http.get('/accounts/:accountId/templates', () => {
    return HttpResponse.json({ templates: mockTemplates, pagination: { cursor: null } })
  }),

  http.post('/accounts/:accountId/templates', async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>
    return HttpResponse.json({
      templateId: `tpl_${Date.now()}`,
      ...body,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }, { status: 201 })
  }),

  http.put('/accounts/:accountId/templates/:templateId', async ({ params, request }) => {
    const template = mockTemplates.find((t) => t.templateId === params.templateId)
    if (!template) return new HttpResponse(null, { status: 404 })
    const body = (await request.json()) as Record<string, unknown>
    return HttpResponse.json({ ...template, ...body, updatedAt: new Date().toISOString() })
  }),

  http.delete('/accounts/:accountId/templates/:templateId', () => {
    return new HttpResponse(null, { status: 204 })
  }),
]

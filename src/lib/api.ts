import { ok, err, type Result } from 'neverthrow'
import { loginClient } from './auth'
import type {
  Account,
  AccountFilteringConfig,
  AccountOnboarding,
  Alias,
  AliasSender,
  SenderPolicy,
  Arc,
  ArcStatus,
  AuditEvent,
  BillingInfo,
  CreateDraftSignalBody,
  CreateRuleBody,
  CreateViewBody,
  Domain,
  EmailTemplate,
  ForwardingAddress,
  Label,
  NotificationSettings,
  Pagination,
  RetentionDuration,
  Rule,
  Signal,
  SignalStatus,
  TeamMember,
  TemplateFunction,
  UnknownSenderPolicy,
  UpdateDraftSignalBody,
  UpdateRuleBody,
  UserRole,
  View,
} from '@/types/server'

export class ApiError {
  constructor(
    public readonly status: number,
    public readonly message: string,
  ) {}
}

export interface ArcListParams {
  workflow?: string
  status?: string
  sender?: string
  after?: string
  before?: string
  cursor?: string
  limit?: number
}

export interface PatchArcBody {
  status?: ArcStatus
  labels?: string[]
}

export interface QuarantineSignalListParams {
  sender?: string
  after?: string
  before?: string
  cursor?: string
  limit?: number
}

// Wire shapes returned by the backend list endpoints.
interface ArcListWire {
  arcs: Arc[]
  pagination: Pagination
}

interface SignalListWire {
  signals: Signal[]
  pagination: Pagination
}

interface AuditListWire {
  events: AuditEvent[]
  pagination: Pagination
}

const BASE = (import.meta.env.VITE_API_BASE_URL as string) ?? 'http://localhost:8787'

async function request<T>(path: string, init: RequestInit = {}): Promise<Result<T, ApiError>> {
  try {
    const token = await loginClient.ensureToken()
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...init.headers,
      },
    })
    if (!res.ok) {
      let message = `${init.method ?? 'GET'} ${path} → ${res.status}`
      const body = (await res.json().catch(() => null)) as { title?: string } | null
      if (body?.title) message = body.title
      return err(new ApiError(res.status, message))
    }
    const data = res.status === 204 ? (undefined as T) : (await res.json()) as T
    return ok(data)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Network error'
    return err(new ApiError(0, message))
  }
}

export const api = {
  async listAccounts(): Promise<Result<Account[], ApiError>> {
    interface AccountListWire {
      accounts: Account[]
    }
    const result = await request<AccountListWire>('/accounts')
    return result.map((w) => w.accounts)
  },

  getAccount(accountId: string): Promise<Result<Account, ApiError>> {
    return request<Account>(`/accounts/${accountId}`)
  },

  createAccount(body: { name: string }): Promise<Result<Account, ApiError>> {
    return request<Account>('/accounts', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  listArcs(accountId: string, params: ArcListParams): Promise<Result<ArcListWire, ApiError>> {
    const qs = new URLSearchParams()
    if (params.workflow) qs.set('workflow', params.workflow)
    if (params.status) qs.set('status', params.status)
    if (params.sender) qs.set('sender', params.sender)
    if (params.after) qs.set('after', params.after)
    if (params.before) qs.set('before', params.before)
    if (params.cursor) qs.set('cursor', params.cursor)
    if (params.limit) qs.set('limit', String(params.limit))
    const query = qs.toString()
    return request<ArcListWire>(
      `/accounts/${accountId}/arcs${query ? `?${query}` : ''}`,
    )
  },

  getArc(accountId: string, arcId: string): Promise<Result<Arc, ApiError>> {
    return request<Arc>(`/accounts/${accountId}/arcs/${arcId}`)
  },

  patchArc(accountId: string, arcId: string, body: PatchArcBody): Promise<Result<Arc, ApiError>> {
    return request<Arc>(`/accounts/${accountId}/arcs/${arcId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    })
  },

  unsubscribeArc(accountId: string, arcId: string): Promise<Result<{ status: string; url?: string }, ApiError>> {
    return request<{ status: string; url?: string }>(`/accounts/${accountId}/arcs/${arcId}/unsubscribe`, {
      method: 'POST',
    })
  },

  listSignals(
    accountId: string,
    arcId: string,
    params: { cursor?: string; limit?: number } = {},
  ): Promise<Result<SignalListWire, ApiError>> {
    const qs = new URLSearchParams()
    if (params.cursor) qs.set('cursor', params.cursor)
    if (params.limit) qs.set('limit', String(params.limit))
    const query = qs.toString()
    return request<SignalListWire>(
      `/accounts/${accountId}/arcs/${arcId}/signals${query ? `?${query}` : ''}`,
    )
  },

  listQuarantinedSignals(
    accountId: string,
    status: 'quarantine_visible' | 'quarantine_hidden',
    params: QuarantineSignalListParams = {},
  ): Promise<Result<SignalListWire, ApiError>> {
    const qs = new URLSearchParams()
    qs.set('status', status)
    if (params.sender) qs.set('sender', params.sender)
    if (params.after) qs.set('after', params.after)
    if (params.before) qs.set('before', params.before)
    if (params.cursor) qs.set('cursor', params.cursor)
    if (params.limit) qs.set('limit', String(params.limit))
    return request<SignalListWire>(`/accounts/${accountId}/signals?${qs.toString()}`)
  },

  quarantineResponse(
    accountId: string,
    signalId: string,
    status: 'active' | 'block_hidden' | 'block_reject',
  ): Promise<Result<Signal, ApiError>> {
    return request<Signal>(`/accounts/${accountId}/signals/${signalId}/quarantineResponse`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    })
  },

  // ─── RSVP ────────────────────────────────────────────────────────────────

  rsvpSignal(
    accountId: string,
    signalId: string,
    response: 'accepted' | 'declined' | 'tentative',
  ): Promise<Result<Signal, ApiError>> {
    return request<Signal>(`/accounts/${accountId}/signals/${signalId}/rsvp`, {
      method: 'POST',
      body: JSON.stringify({ response }),
    })
  },

  // ─── Draft signals (Reply composer) ──────────────────────────────────────

  createDraftSignal(
    accountId: string,
    arcId: string,
    body: CreateDraftSignalBody,
  ): Promise<Result<Signal, ApiError>> {
    return request<Signal>(`/accounts/${accountId}/arcs/${arcId}/signals`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  updateDraftSignal(
    accountId: string,
    signalId: string,
    body: UpdateDraftSignalBody,
  ): Promise<Result<Signal, ApiError>> {
    return request<Signal>(`/accounts/${accountId}/signals/${signalId}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    })
  },

  sendSignal(accountId: string, signalId: string): Promise<Result<Signal, ApiError>> {
    return request<Signal>(`/accounts/${accountId}/signals/${signalId}/send`, { method: 'POST' })
  },

  patchSignal(
    accountId: string,
    signalId: string,
    body: { status: SignalStatus },
  ): Promise<Result<Signal, ApiError>> {
    return request<Signal>(`/accounts/${accountId}/signals/${signalId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    })
  },

  deleteDraftSignal(accountId: string, signalId: string): Promise<Result<void, ApiError>> {
    return request<void>(`/accounts/${accountId}/signals/${signalId}`, { method: 'DELETE' })
  },

  // ─── Rules ───────────────────────────────────────────────────────────────

  async listRules(accountId: string): Promise<Result<Rule[], ApiError>> {
    interface RuleListWire { rules: Rule[]; pagination: Pagination }
    const result = await request<RuleListWire>(`/accounts/${accountId}/rules`)
    return result.map((w) => w.rules)
  },

  createRule(accountId: string, body: CreateRuleBody): Promise<Result<Rule, ApiError>> {
    return request<Rule>(`/accounts/${accountId}/rules`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  updateRule(
    accountId: string,
    ruleId: string,
    body: UpdateRuleBody,
  ): Promise<Result<Rule, ApiError>> {
    return request<Rule>(`/accounts/${accountId}/rules/${ruleId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    })
  },

  deleteRule(accountId: string, ruleId: string): Promise<Result<void, ApiError>> {
    return request<void>(`/accounts/${accountId}/rules/${ruleId}`, { method: 'DELETE' })
  },

  // ─── Labels ──────────────────────────────────────────────────────────────

  async listLabels(accountId: string): Promise<Result<Label[], ApiError>> {
    interface LabelListWire { labels: Label[]; pagination: Pagination }
    const result = await request<LabelListWire>(`/accounts/${accountId}/labels`)
    return result.map((w) => w.labels)
  },

  createLabel(
    accountId: string,
    body: { name: string; color?: string; icon?: string },
  ): Promise<Result<Label, ApiError>> {
    return request<Label>(`/accounts/${accountId}/labels`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  updateLabel(
    accountId: string,
    labelId: string,
    body: { name?: string; color?: string; icon?: string },
  ): Promise<Result<Label, ApiError>> {
    return request<Label>(`/accounts/${accountId}/labels/${labelId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    })
  },

  deleteLabel(accountId: string, labelId: string): Promise<Result<void, ApiError>> {
    return request<void>(`/accounts/${accountId}/labels/${labelId}`, { method: 'DELETE' })
  },

  // ─── Saved views ─────────────────────────────────────────────────────────

  async listViews(accountId: string): Promise<Result<View[], ApiError>> {
    interface ViewListWire { views: View[]; pagination: Pagination }
    const result = await request<ViewListWire>(`/accounts/${accountId}/views`)
    return result.map((w) => w.views)
  },

  createView(accountId: string, body: CreateViewBody): Promise<Result<View, ApiError>> {
    return request<View>(`/accounts/${accountId}/views`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  updateView(
    accountId: string,
    viewId: string,
    body: Partial<CreateViewBody>,
  ): Promise<Result<View, ApiError>> {
    return request<View>(`/accounts/${accountId}/views/${viewId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    })
  },

  deleteView(accountId: string, viewId: string): Promise<Result<void, ApiError>> {
    return request<void>(`/accounts/${accountId}/views/${viewId}`, { method: 'DELETE' })
  },

  // ─── Account ─────────────────────────────────────────────────────────────

  updateAccount(
    accountId: string,
    body: {
      name?: string
      retentionDuration?: RetentionDuration
      notifications?: NotificationSettings
      filtering?: AccountFilteringConfig
      onboarding?: Partial<AccountOnboarding>
      afterSendAction?: 'archive' | 'keep_active'
      defaultCalendarInviteForwardingAddress?: string
    },
  ): Promise<Result<Account, ApiError>> {
    return request<Account>(`/accounts/${accountId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    })
  },

  // ─── Aliases (email addresses) ────────────────────────────────────────────

  async listAliases(accountId: string): Promise<Result<Alias[], ApiError>> {
    interface AliasListWire {
      aliases: Alias[]
      pagination: Pagination
    }
    const result = await request<AliasListWire>(`/accounts/${accountId}/aliases`)
    return result.map((w) => w.aliases)
  },

  createAlias(
    accountId: string,
    body: { address: string; unknownSenderPolicy?: UnknownSenderPolicy },
  ): Promise<Result<Alias, ApiError>> {
    return request<Alias>(`/accounts/${accountId}/aliases`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  updateAlias(
    accountId: string,
    address: string,
    body: { unknownSenderPolicy?: UnknownSenderPolicy; spamScoreThreshold?: number },
  ): Promise<Result<Alias, ApiError>> {
    return request<Alias>(`/accounts/${accountId}/aliases/${encodeURIComponent(address)}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    })
  },

  // ─── Alias senders sub-resource ──────────────────────────────────────────────

  async listAliasSenders(accountId: string, address: string): Promise<Result<AliasSender[], ApiError>> {
    interface Wire { senders: AliasSender[] }
    const result = await request<Wire>(`/accounts/${accountId}/aliases/${encodeURIComponent(address)}/senders`)
    return result.map((w) => w.senders)
  },

  addAliasSender(
    accountId: string,
    address: string,
    body: { sender: string; policy: SenderPolicy },
  ): Promise<Result<AliasSender, ApiError>> {
    return request<AliasSender>(
      `/accounts/${accountId}/aliases/${encodeURIComponent(address)}/senders`,
      { method: 'POST', body: JSON.stringify(body) },
    )
  },

  removeAliasSender(accountId: string, address: string, sender: string): Promise<Result<void, ApiError>> {
    return request<void>(
      `/accounts/${accountId}/aliases/${encodeURIComponent(address)}/senders/${encodeURIComponent(sender)}`,
      { method: 'DELETE' },
    )
  },

  deleteAlias(accountId: string, address: string): Promise<Result<void, ApiError>> {
    return request<void>(`/accounts/${accountId}/aliases/${encodeURIComponent(address)}`, {
      method: 'DELETE',
    })
  },

  // ─── Domains ─────────────────────────────────────────────────────────────

  async listDomains(accountId: string): Promise<Result<Domain[], ApiError>> {
    interface DomainListWire { domains: Domain[]; pagination: Pagination }
    const result = await request<DomainListWire>(`/accounts/${accountId}/domains`)
    return result.map((w) => w.domains)
  },

  addDomain(accountId: string, body: { domain: string }): Promise<Result<Domain, ApiError>> {
    return request<Domain>(`/accounts/${accountId}/domains`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  recheckDomain(accountId: string, domainId: string): Promise<Result<Domain, ApiError>> {
    return request<Domain>(`/accounts/${accountId}/domains/${domainId}`, { method: 'PATCH' })
  },

  deleteDomain(accountId: string, domainId: string): Promise<Result<void, ApiError>> {
    return request<void>(`/accounts/${accountId}/domains/${domainId}`, { method: 'DELETE' })
  },

  // ─── Forwarding addresses ─────────────────────────────────────────────────

  async listForwardingAddresses(accountId: string): Promise<Result<ForwardingAddress[], ApiError>> {
    interface FwdListWire { forwardingAddresses: ForwardingAddress[]; pagination: Pagination }
    const result = await request<FwdListWire>(`/accounts/${accountId}/forwarding-addresses`)
    return result.map((w) => w.forwardingAddresses)
  },

  createForwardingAddress(
    accountId: string,
    body: { address: string },
  ): Promise<Result<ForwardingAddress, ApiError>> {
    return request<ForwardingAddress>(`/accounts/${accountId}/forwarding-addresses`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  deleteForwardingAddress(accountId: string, address: string): Promise<Result<void, ApiError>> {
    return request<void>(`/accounts/${accountId}/forwarding-addresses/${encodeURIComponent(address)}`, {
      method: 'DELETE',
    })
  },

  // ─── Team members ─────────────────────────────────────────────────────────

  async listTeamMembers(accountId: string): Promise<Result<TeamMember[], ApiError>> {
    interface TeamListWire { users: TeamMember[]; pagination: Pagination }
    const result = await request<TeamListWire>(`/accounts/${accountId}/users`)
    return result.map((w) => w.users)
  },

  inviteTeamMember(
    accountId: string,
    body: { email: string; role: UserRole },
  ): Promise<Result<TeamMember, ApiError>> {
    return request<TeamMember>(`/accounts/${accountId}/users`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  updateTeamMember(
    accountId: string,
    userId: string,
    body: { role: UserRole },
  ): Promise<Result<TeamMember, ApiError>> {
    return request<TeamMember>(`/accounts/${accountId}/users/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    })
  },

  removeTeamMember(accountId: string, userId: string): Promise<Result<void, ApiError>> {
    return request<void>(`/accounts/${accountId}/users/${userId}`, { method: 'DELETE' })
  },

  // ─── Audit log ────────────────────────────────────────────────────────────

  listAuditEvents(
    accountId: string,
    params: { cursor?: string; limit?: number } = {},
  ): Promise<Result<AuditListWire, ApiError>> {
    const qs = new URLSearchParams()
    if (params.cursor) qs.set('cursor', params.cursor)
    if (params.limit) qs.set('limit', String(params.limit))
    const query = qs.toString()
    return request<AuditListWire>(
      `/accounts/${accountId}/audit${query ? `?${query}` : ''}`,
    )
  },

  // ─── Billing ─────────────────────────────────────────────────────────────────

  getBilling(accountId: string): Promise<Result<BillingInfo, ApiError>> {
    return request<BillingInfo>(`/accounts/${accountId}/billing`)
  },

  createCheckoutSession(
    accountId: string,
    body: { priceId: string; successUrl: string; cancelUrl: string },
  ): Promise<Result<{ url: string }, ApiError>> {
    return request<{ url: string }>(`/accounts/${accountId}/billing/checkout-session`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  createBillingPortalSession(
    accountId: string,
    body: { returnUrl: string },
  ): Promise<Result<{ url: string }, ApiError>> {
    return request<{ url: string }>(`/accounts/${accountId}/billing/portal-session`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  // ─── Email templates ────────────────────────────────────────────────────────

  async listTemplates(accountId: string): Promise<Result<EmailTemplate[], ApiError>> {
    interface TemplateListWire { templates: EmailTemplate[]; pagination: Pagination }
    const result = await request<TemplateListWire>(`/accounts/${accountId}/templates`)
    return result.map((w) => w.templates)
  },

  createTemplate(
    accountId: string,
    body: { name: string; subject: string; body: string; functions?: TemplateFunction[] },
  ): Promise<Result<EmailTemplate, ApiError>> {
    return request<EmailTemplate>(`/accounts/${accountId}/templates`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  updateTemplate(
    accountId: string,
    templateId: string,
    body: { name: string; subject: string; body: string; functions?: TemplateFunction[] },
  ): Promise<Result<EmailTemplate, ApiError>> {
    return request<EmailTemplate>(`/accounts/${accountId}/templates/${templateId}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    })
  },

  deleteTemplate(accountId: string, templateId: string): Promise<Result<void, ApiError>> {
    return request<void>(`/accounts/${accountId}/templates/${templateId}`, { method: 'DELETE' })
  },
}

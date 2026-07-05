import { ok, err, type Result } from 'neverthrow'
import { loginClient } from './auth'
import type {
  Account,
  AccountFilteringConfig,
  AccountOnboarding,
  Alias,
  AliasSender,
  SenderPolicy,
  Thread,
  ThreadStatus,
  AuditEvent,
  BillingInfo,
  CreateDraftSignalBody,
  CreateRuleBody,
  CreateViewBody,
  Domain,
  EmailTemplate,
  ForwardingTarget,
  Label,
  NotificationSettings,
  Pagination,
  RetentionDuration,
  Rule,
  Signal,
  QuarantinedSignal,
  SignalStatus,
  StatsResponse,
  TeamMember,
  TemplateFunction,
  UnknownSenderPolicy,
  UpdateDraftSignalBody,
  UpdateRuleBody,
  UserConfiguration,
  UserRole,
  View,
} from '@/types/server'

export class ApiError {
  constructor(
    public readonly status: number,
    public readonly message: string,
  ) {}
}

export interface ThreadListParams {
  workflow?: string
  status?: string
  sender?: string
  after?: string
  before?: string
  cursor?: string
  limit?: number
}

export interface PatchThreadBody {
  status?: ThreadStatus
  labels?: string[]
  followupAt?: string
}

export interface QuarantineSignalListParams {
  sender?: string
  after?: string
  before?: string
  cursor?: string
  limit?: number
}

// Wire shapes returned by the backend list endpoints.
interface ThreadListWire {
  threads: Thread[]
  pagination: Pagination
}

interface SignalListWire {
  signals: Signal[]
  pagination: Pagination
}

interface QuarantineSignalListWire {
  signals: QuarantinedSignal[]
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
      const body = (await res.json().catch(() => null)) as { title?: string; details?: string; errorCode?: string } | null
      const message = body?.title
        ? `${body.title}${body.details ? `: ${body.details}` : ''}${body.errorCode ? ` (${body.errorCode})` : ''} [${res.status}]`
        : `${init.method ?? 'GET'} ${path} → ${res.status}`
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

  listThreads(accountId: string, params: ThreadListParams): Promise<Result<ThreadListWire, ApiError>> {
    const qs = new URLSearchParams()
    if (params.workflow) qs.set('workflow', params.workflow)
    if (params.status) qs.set('status', params.status)
    if (params.sender) qs.set('sender', params.sender)
    if (params.after) qs.set('after', params.after)
    if (params.before) qs.set('before', params.before)
    if (params.cursor) qs.set('cursor', params.cursor)
    if (params.limit) qs.set('limit', String(params.limit))
    const query = qs.toString()
    return request<ThreadListWire>(
      `/accounts/${accountId}/threads${query ? `?${query}` : ''}`,
    )
  },

  getThread(accountId: string, threadId: string): Promise<Result<Thread, ApiError>> {
    return request<Thread>(`/accounts/${accountId}/threads/${threadId}`)
  },

  patchThread(accountId: string, threadId: string, body: PatchThreadBody): Promise<Result<Thread, ApiError>> {
    return request<Thread>(`/accounts/${accountId}/threads/${threadId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    })
  },

  unsubscribeThread(accountId: string, threadId: string): Promise<Result<{ status: string; url?: string }, ApiError>> {
    return request<{ status: string; url?: string }>(`/accounts/${accountId}/threads/${threadId}/unsubscribe`, {
      method: 'POST',
    })
  },

  listSignals(
    accountId: string,
    threadId: string,
    params: { cursor?: string; limit?: number } = {},
  ): Promise<Result<SignalListWire, ApiError>> {
    const qs = new URLSearchParams()
    if (params.cursor) qs.set('cursor', params.cursor)
    if (params.limit) qs.set('limit', String(params.limit))
    const query = qs.toString()
    return request<SignalListWire>(
      `/accounts/${accountId}/threads/${threadId}/signals${query ? `?${query}` : ''}`,
    )
  },

  listQuarantinedSignals(
    accountId: string,
    status: 'quarantine_visible' | 'quarantine_hidden',
    params: QuarantineSignalListParams = {},
  ): Promise<Result<QuarantineSignalListWire, ApiError>> {
    const qs = new URLSearchParams()
    qs.set('status', status)
    if (params.sender) qs.set('sender', params.sender)
    if (params.after) qs.set('after', params.after)
    if (params.before) qs.set('before', params.before)
    if (params.cursor) qs.set('cursor', params.cursor)
    if (params.limit) qs.set('limit', String(params.limit))
    return request<QuarantineSignalListWire>(`/accounts/${accountId}/signals?${qs.toString()}`)
  },



  quarantineResponse(
    accountId: string,
    signalId: string,
    status: 'active' | 'block_hidden' | 'block_reject',
  ): Promise<Result<{ thread?: { threadId: string }; signal?: Signal } & Record<string, unknown>, ApiError>> {
    return request<{ thread?: { threadId: string }; signal?: Signal } & Record<string, unknown>>(`/accounts/${accountId}/signals/${signalId}/quarantineResponse`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    })
  },

  // ─── RSVP ────────────────────────────────────────────────────────────────

  rsvpSignal(
    accountId: string,
    threadId: string,
    signalId: string,
    response: 'accepted' | 'declined' | 'tentative',
  ): Promise<Result<Signal, ApiError>> {
    return request<Signal>(`/accounts/${accountId}/threads/${threadId}/signals/${signalId}/rsvp`, {
      method: 'POST',
      body: JSON.stringify({ response }),
    })
  },

  // ─── Draft signals (Reply composer) ──────────────────────────────────────

  createDraftSignal(
    accountId: string,
    threadId: string,
    body: CreateDraftSignalBody,
  ): Promise<Result<Signal, ApiError>> {
    return request<Signal>(`/accounts/${accountId}/threads/${threadId}/signals`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  updateDraftSignal(
    accountId: string,
    threadId: string,
    signalId: string,
    body: UpdateDraftSignalBody,
  ): Promise<Result<Signal, ApiError>> {
    return request<Signal>(`/accounts/${accountId}/threads/${threadId}/signals/${signalId}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    })
  },

  sendSignal(accountId: string, threadId: string, signalId: string): Promise<Result<Signal, ApiError>> {
    return request<Signal>(`/accounts/${accountId}/threads/${threadId}/signals/${signalId}/send`, { method: 'POST' })
  },

  patchSignal(
    accountId: string,
    threadId: string,
    signalId: string,
    body: { status: SignalStatus },
  ): Promise<Result<Signal, ApiError>> {
    return request<Signal>(`/accounts/${accountId}/threads/${threadId}/signals/${signalId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    })
  },

  deleteDraftSignal(accountId: string, threadId: string, signalId: string): Promise<Result<void, ApiError>> {
    return request<void>(`/accounts/${accountId}/threads/${threadId}/signals/${signalId}`, { method: 'DELETE' })
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
      defaultCalendarInviteForwardingTargetId?: string
      digest?: { frequency: 'daily' | 'weekly' | 'monthly'; forwardingTargetId: string } | null
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
    body: { unknownSenderPolicy?: UnknownSenderPolicy },
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
    body: { domain: string; policy: SenderPolicy },
  ): Promise<Result<AliasSender, ApiError>> {
    return request<AliasSender>(
      `/accounts/${accountId}/aliases/${encodeURIComponent(address)}/senders`,
      { method: 'POST', body: JSON.stringify(body) },
    )
  },

  updateAliasSender(
    accountId: string,
    address: string,
    senderDomain: string,
    body: { policy: SenderPolicy },
  ): Promise<Result<AliasSender, ApiError>> {
    return request<AliasSender>(
      `/accounts/${accountId}/aliases/${encodeURIComponent(address)}/senders/${encodeURIComponent(senderDomain)}`,
      { method: 'PUT', body: JSON.stringify(body) },
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

  async listForwardingAddresses(accountId: string): Promise<Result<ForwardingTarget[], ApiError>> {
    interface FwdListWire { forwardingTargets: ForwardingTarget[]; pagination: Pagination }
    const result = await request<FwdListWire>(`/accounts/${accountId}/forwarding-addresses`)
    return result.map((w) => w.forwardingTargets)
  },

  createForwardingAddress(
    accountId: string,
    body: { target: string; type: 'email' | 'webhook' },
  ): Promise<Result<ForwardingTarget, ApiError>> {
    return request<ForwardingTarget>(`/accounts/${accountId}/forwarding-addresses`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  deleteForwardingAddress(accountId: string, address: string): Promise<Result<void, ApiError>> {
    return request<void>(`/accounts/${accountId}/forwarding-addresses/${encodeURIComponent(address)}`, {
      method: 'DELETE',
    })
  },

  verifyForwardingAddress(accountId: string, address: string, token: string): Promise<Result<void, ApiError>> {
    return request<void>(`/accounts/${accountId}/forwarding-addresses/${encodeURIComponent(address)}/verify`, {
      method: 'POST',
      body: JSON.stringify({ token }),
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

  // ─── Stats ──────────────────────────────────────────────────────────────────

  getStats(accountId: string): Promise<Result<StatsResponse, ApiError>> {
    return request<StatsResponse>(`/accounts/${accountId}/stats`)
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

  // ─── Support tickets ────────────────────────────────────────────────────────

  createSupportTicket(
    accountId: string,
    body: { category: string; subject: string; description: string; context: string },
  ): Promise<Result<{ ticketId: string }, ApiError>> {
    return request<{ ticketId: string }>(`/accounts/${accountId}/support-tickets`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  // ─── Admin ──────────────────────────────────────────────────────────────────

  getSignal(accountId: string, threadId: string, signalId: string): Promise<Result<Signal, ApiError>> {
    return request<Signal>(`/accounts/${accountId}/threads/${threadId}/signals/${signalId}`)
  },

  reprocessSignal(accountId: string, threadId: string, signalId: string): Promise<Result<Signal, ApiError>> {
    return request<Signal>(`/accounts/${accountId}/threads/${threadId}/signals/${signalId}/reprocess`, {
      method: 'POST',
    })
  },

  async getRawEmail(accountId: string, threadId: string, signalId: string): Promise<Result<string, ApiError>> {
    try {
      const token = await loginClient.ensureToken()
      const res = await fetch(`${BASE}/accounts/${accountId}/threads/${threadId}/signals/${signalId}/raw`, {
        headers: { Authorization: `Bearer ${token}` },
        redirect: 'follow',
      })
      if (!res.ok) return err(new ApiError(res.status, `Failed to fetch raw email: ${res.status}`))
      return ok(await res.text())
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Network error'
      return err(new ApiError(0, message))
    }
  },

  // ─── User Configuration (global, not account-scoped) ─────────────────────

  getUserConfiguration(userId: string): Promise<Result<UserConfiguration, ApiError>> {
    return request<UserConfiguration>(`/user/${userId}/configuration`)
  },

  updateUserConfiguration(userId: string, body: Partial<UserConfiguration>): Promise<Result<UserConfiguration, ApiError>> {
    return request<UserConfiguration>(`/user/${userId}/configuration`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    })
  },
}

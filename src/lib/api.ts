import { ok, err, type Result } from 'neverthrow'
import { loginClient } from './auth'
import type {
  Account,
  Arc,
  ArcStatus,
  AuditEvent,
  CreateDraftSignalBody,
  CreateRuleBody,
  CreateSavedViewBody,
  Domain,
  ForwardingAddress,
  Label,
  Page,
  Rule,
  SavedView,
  Signal,
  TeamMember,
  UpdateDraftSignalBody,
  UpdateRuleBody,
  UserRole,
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
  pagination: { cursor: string | null }
}

interface SignalListWire {
  signals: Signal[]
  pagination: { cursor: string | null }
}

const BASE = import.meta.env.VITE_API_BASE_URL as string

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
    const data = (await res.json()) as T
    return ok(data)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Network error'
    return err(new ApiError(0, message))
  }
}

export const api = {
  getAccount(accountId: string): Promise<Result<Account, ApiError>> {
    return request<Account>(`/accounts/${accountId}`)
  },

  async listArcs(accountId: string, params: ArcListParams): Promise<Result<Page<Arc>, ApiError>> {
    const qs = new URLSearchParams()
    if (params.workflow) qs.set('workflow', params.workflow)
    if (params.status) qs.set('status', params.status)
    if (params.sender) qs.set('sender', params.sender)
    if (params.after) qs.set('after', params.after)
    if (params.before) qs.set('before', params.before)
    if (params.cursor) qs.set('cursor', params.cursor)
    if (params.limit) qs.set('limit', String(params.limit))
    const query = qs.toString()
    const result = await request<ArcListWire>(
      `/accounts/${accountId}/arcs${query ? `?${query}` : ''}`,
    )
    return result.map(({ arcs, pagination }) => ({
      items: arcs,
      nextCursor: pagination.cursor ?? undefined,
    }))
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

  async listSignals(
    accountId: string,
    arcId: string,
    params: { cursor?: string; limit?: number } = {},
  ): Promise<Result<Page<Signal>, ApiError>> {
    const qs = new URLSearchParams()
    if (params.cursor) qs.set('cursor', params.cursor)
    if (params.limit) qs.set('limit', String(params.limit))
    const query = qs.toString()
    const result = await request<SignalListWire>(
      `/accounts/${accountId}/arcs/${arcId}/signals${query ? `?${query}` : ''}`,
    )
    return result.map(({ signals, pagination }) => ({
      items: signals,
      nextCursor: pagination.cursor ?? undefined,
    }))
  },

  async listQuarantinedSignals(
    accountId: string,
    status: 'quarantine_visible' | 'quarantine_hidden',
    params: QuarantineSignalListParams = {},
  ): Promise<Result<Page<Signal>, ApiError>> {
    const qs = new URLSearchParams()
    qs.set('status', status)
    if (params.sender) qs.set('sender', params.sender)
    if (params.after) qs.set('after', params.after)
    if (params.before) qs.set('before', params.before)
    if (params.cursor) qs.set('cursor', params.cursor)
    if (params.limit) qs.set('limit', String(params.limit))
    const result = await request<SignalListWire>(`/accounts/${accountId}/signals?${qs.toString()}`)
    return result.map(({ signals, pagination }) => ({
      items: signals,
      nextCursor: pagination.cursor ?? undefined,
    }))
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

  // ─── Draft signals (Reply composer) ──────────────────────────────────────

  createDraftSignal(
    accountId: string,
    body: CreateDraftSignalBody,
  ): Promise<Result<Signal, ApiError>> {
    return request<Signal>(`/accounts/${accountId}/signals`, {
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

  deleteDraftSignal(accountId: string, signalId: string): Promise<Result<void, ApiError>> {
    return request<void>(`/accounts/${accountId}/signals/${signalId}`, { method: 'DELETE' })
  },

  // ─── Rules ───────────────────────────────────────────────────────────────

  // TODO(backend): GET/POST/PATCH/DELETE /accounts/:id/rules (Phase 7)
  async listRules(accountId: string): Promise<Result<Rule[], ApiError>> {
    interface RuleListWire {
      rules: Rule[]
    }
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

  // TODO(backend): GET/POST/PATCH/DELETE /accounts/:id/labels (Phase 6)
  async listLabels(accountId: string): Promise<Result<Label[], ApiError>> {
    interface LabelListWire {
      labels: Label[]
    }
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

  // TODO(backend): GET/POST/PATCH/DELETE /accounts/:id/views (Phase 6)
  async listViews(accountId: string): Promise<Result<SavedView[], ApiError>> {
    interface ViewListWire {
      views: SavedView[]
    }
    const result = await request<ViewListWire>(`/accounts/${accountId}/views`)
    return result.map((w) => w.views)
  },

  createView(accountId: string, body: CreateSavedViewBody): Promise<Result<SavedView, ApiError>> {
    return request<SavedView>(`/accounts/${accountId}/views`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  updateView(
    accountId: string,
    viewId: string,
    body: Partial<CreateSavedViewBody>,
  ): Promise<Result<SavedView, ApiError>> {
    return request<SavedView>(`/accounts/${accountId}/views/${viewId}`, {
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
    body: { name?: string; deletionRetentionDays?: number },
  ): Promise<Result<Account, ApiError>> {
    return request<Account>(`/accounts/${accountId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    })
  },

  // ─── Aliases (email addresses) ────────────────────────────────────────────

  async listAliases(
    accountId: string,
  ): Promise<Result<import('@/types/server').EmailAddressConfig[], ApiError>> {
    interface AliasListWire {
      aliases: import('@/types/server').EmailAddressConfig[]
    }
    const result = await request<AliasListWire>(`/accounts/${accountId}/aliases`)
    return result.map((w) => w.aliases)
  },

  createAlias(
    accountId: string,
    body: { address: string; filterMode?: string },
  ): Promise<Result<import('@/types/server').EmailAddressConfig, ApiError>> {
    return request(`/accounts/${accountId}/aliases`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  updateAlias(
    accountId: string,
    address: string,
    body: {
      filterMode?: string
      approvedSenders?: string[]
      blockedSenders?: string[]
    },
  ): Promise<Result<import('@/types/server').EmailAddressConfig, ApiError>> {
    return request(`/accounts/${accountId}/aliases/${encodeURIComponent(address)}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    })
  },

  deleteAlias(accountId: string, address: string): Promise<Result<void, ApiError>> {
    return request<void>(`/accounts/${accountId}/aliases/${encodeURIComponent(address)}`, {
      method: 'DELETE',
    })
  },

  // ─── Domains ─────────────────────────────────────────────────────────────

  // TODO(backend): GET /accounts/:id/domains (Phase 9)
  async listDomains(accountId: string): Promise<Result<Domain[], ApiError>> {
    interface DomainListWire {
      domains: Domain[]
    }
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

  // ─── Forwarding addresses ─────────────────────────────────────────────────

  // TODO(backend): GET/POST/DELETE /accounts/:id/forwarding-addresses (Phase 9)
  async listForwardingAddresses(accountId: string): Promise<Result<ForwardingAddress[], ApiError>> {
    interface FwdListWire {
      forwardingAddresses: ForwardingAddress[]
    }
    const result = await request<FwdListWire>(`/accounts/${accountId}/forwarding-addresses`)
    return result.map((w) => w.forwardingAddresses)
  },

  createForwardingAddress(
    accountId: string,
    body: { address: string; label?: string },
  ): Promise<Result<ForwardingAddress, ApiError>> {
    return request<ForwardingAddress>(`/accounts/${accountId}/forwarding-addresses`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  deleteForwardingAddress(accountId: string, id: string): Promise<Result<void, ApiError>> {
    return request<void>(`/accounts/${accountId}/forwarding-addresses/${id}`, {
      method: 'DELETE',
    })
  },

  // ─── Team members ─────────────────────────────────────────────────────────

  // TODO(backend): GET/POST/PATCH/DELETE /accounts/:id/users (Phase 9)
  async listTeamMembers(accountId: string): Promise<Result<TeamMember[], ApiError>> {
    interface TeamListWire {
      users: TeamMember[]
    }
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

  // TODO(backend): GET /accounts/:id/audit-log (Phase 10)
  async listAuditEvents(
    accountId: string,
    params: { cursor?: string; limit?: number } = {},
  ): Promise<Result<Page<AuditEvent>, ApiError>> {
    interface AuditListWire {
      events: AuditEvent[]
      pagination: { cursor: string | null }
    }
    const qs = new URLSearchParams()
    if (params.cursor) qs.set('cursor', params.cursor)
    if (params.limit) qs.set('limit', String(params.limit))
    const query = qs.toString()
    const result = await request<AuditListWire>(
      `/accounts/${accountId}/audit-log${query ? `?${query}` : ''}`,
    )
    return result.map(({ events, pagination }) => ({
      items: events,
      nextCursor: pagination.cursor ?? undefined,
    }))
  },
}

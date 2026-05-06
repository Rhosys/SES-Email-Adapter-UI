import { ok, err, type Result } from 'neverthrow'
import { loginClient } from './auth'
import type {
  Account,
  Arc,
  ArcStatus,
  CreateRuleBody,
  EmailAddressConfig,
  Page,
  Rule,
  Signal,
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

  allowSender(
    accountId: string,
    recipientAddress: string,
    senderAddress: string,
    currentApprovedSenders: string[],
  ): Promise<Result<EmailAddressConfig, ApiError>> {
    const approvedSenders = [...new Set([...currentApprovedSenders, senderAddress])]
    return request<EmailAddressConfig>(
      `/accounts/${accountId}/aliases/${encodeURIComponent(recipientAddress)}`,
      { method: 'PATCH', body: JSON.stringify({ approvedSenders }) },
    )
  },

  // TODO(backend): POST /accounts/:id/rules — rules engine (Phase 7)
  createRule(accountId: string, body: CreateRuleBody): Promise<Result<Rule, ApiError>> {
    return request<Rule>(`/accounts/${accountId}/rules`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  // TODO(backend): blockedSenders field on EmailAddressConfig and PATCH support required
  blockSender(
    accountId: string,
    recipientAddress: string,
    senderAddress: string,
    currentBlockedSenders: string[],
  ): Promise<Result<EmailAddressConfig, ApiError>> {
    const blockedSenders = [...new Set([...currentBlockedSenders, senderAddress])]
    return request<EmailAddressConfig>(
      `/accounts/${accountId}/aliases/${encodeURIComponent(recipientAddress)}`,
      { method: 'PATCH', body: JSON.stringify({ blockedSenders }) },
    )
  },
}

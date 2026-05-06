import { ok, err, type Result } from 'neverthrow'
import { loginClient } from './auth'
import type { Account, Arc, ArcStatus, DismissReason, Page, Signal } from '@/types/server'

export class ApiError {
  constructor(
    public readonly status: number,
    public readonly message: string,
  ) {}
}

export interface ArcListParams {
  workflow?: string
  status?: string
  cursor?: string
  limit?: number
}

export interface PatchArcBody {
  status?: ArcStatus
  labels?: string[]
}

export interface QuarantineListParams {
  sender?: string
  blockReason?: string
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

async function requestEmpty(path: string, init: RequestInit = {}): Promise<Result<void, ApiError>> {
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
    return ok(undefined)
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

  async listQuarantined(
    accountId: string,
    params: QuarantineListParams = {},
  ): Promise<Result<Page<Signal>, ApiError>> {
    const qs = new URLSearchParams()
    qs.set('status', 'quarantined')
    if (params.sender) qs.set('sender', params.sender)
    if (params.blockReason) qs.set('blockReason', params.blockReason)
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

  allowSignal(accountId: string, signalId: string): Promise<Result<Signal, ApiError>> {
    return request<Signal>(`/accounts/${accountId}/signals/${signalId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'active' }),
    })
  },

  dismissSignal(
    accountId: string,
    signalId: string,
    reason?: DismissReason,
  ): Promise<Result<void, ApiError>> {
    const qs = reason ? `?reason=${reason}` : ''
    return requestEmpty(`/accounts/${accountId}/signals/${signalId}${qs}`, { method: 'DELETE' })
  },
}

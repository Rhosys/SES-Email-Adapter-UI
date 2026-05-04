import { ok, err, type Result } from 'neverthrow'
import { loginClient } from './auth'
import type { Account, Arc, ArcStatus, Page, Signal } from '@/types/server'

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
      return err(new ApiError(res.status, `${init.method ?? 'GET'} ${path} → ${res.status}`))
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

  listArcs(accountId: string, params: ArcListParams): Promise<Result<Page<Arc>, ApiError>> {
    const qs = new URLSearchParams()
    if (params.workflow) qs.set('workflow', params.workflow)
    if (params.status) qs.set('status', params.status)
    if (params.cursor) qs.set('cursor', params.cursor)
    if (params.limit) qs.set('limit', String(params.limit))
    const query = qs.toString()
    return request<Page<Arc>>(`/accounts/${accountId}/arcs${query ? `?${query}` : ''}`)
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

  listSignals(
    accountId: string,
    arcId: string,
    params: { cursor?: string; limit?: number } = {},
  ): Promise<Result<Page<Signal>, ApiError>> {
    const qs = new URLSearchParams()
    if (params.cursor) qs.set('cursor', params.cursor)
    if (params.limit) qs.set('limit', String(params.limit))
    const query = qs.toString()
    return request<Page<Signal>>(
      `/accounts/${accountId}/arcs/${arcId}/signals${query ? `?${query}` : ''}`,
    )
  },
}

import type {
  Arc, Page, Signal, Pong, Label, Rule, Account,
  DomainRegistration, FilterMode, TestEmail, TestEmailStatus
} from '@/types/server';
import { useAccountStore } from '@/stores/account';

const BASE_URL = import.meta.env.VITE_API_BASE_URL;

export class ApiError extends Error {
  constructor(public readonly status: number, message: string, public readonly body?: unknown) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | null | undefined>;
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const url = new URL(path.replace(/^\//, ''), BASE_URL.endsWith('/') ? BASE_URL : BASE_URL + '/');
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v !== null && v !== undefined) url.searchParams.set(k, String(v));
    }
  }

  const headers: Record<string, string> = { 'content-type': 'application/json' };
  const token = useAccountStore().token;
  if (token) headers.authorization = `Bearer ${token}`;

  const res = await fetch(url.toString(), {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined
  });

  if (!res.ok) {
    let body: unknown;
    try { body = await res.json(); } catch { body = await res.text(); }
    throw new ApiError(res.status, `${res.status} ${res.statusText}`, body);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  account: {
    me: () => request<Account>('account')
  },
  arcs: {
    list: (params: { cursor?: string | null; status?: string } = {}) =>
      request<Page<Arc>>('arcs', { query: { cursor: params.cursor ?? null, status: params.status } }),
    get: (id: string) => request<Arc>(`arcs/${encodeURIComponent(id)}`),
    archive: (id: string) => request<void>(`arcs/${encodeURIComponent(id)}/archive`, { method: 'POST' })
  },
  signals: {
    listByArc: (arcId: string) => request<Page<Signal>>(`arcs/${encodeURIComponent(arcId)}/signals`),
    quarantined: (cursor?: string | null) =>
      request<Page<Signal>>('quarantine', { query: { cursor: cursor ?? null } }),
    allow: (id: string) => request<void>(`signals/${encodeURIComponent(id)}/allow`, { method: 'POST' }),
    dismiss: (id: string) => request<void>(`signals/${encodeURIComponent(id)}/dismiss`, { method: 'POST' })
  },
  pongs: {
    create: (arcId: string, body: Pick<Pong, 'bodyMarkdown'>) =>
      request<Pong>(`arcs/${encodeURIComponent(arcId)}/pongs`, { method: 'POST', body }),
    send: (id: string) => request<Pong>(`pongs/${encodeURIComponent(id)}/send`, { method: 'POST' })
  },
  labels: {
    list: () => request<Label[]>('labels'),
    create: (label: Omit<Label, 'id'>) => request<Label>('labels', { method: 'POST', body: label }),
    remove: (id: string) => request<void>(`labels/${encodeURIComponent(id)}`, { method: 'DELETE' })
  },
  rules: {
    list: () => request<Rule[]>('rules'),
    upsert: (rule: Rule) => request<Rule>(`rules/${encodeURIComponent(rule.id)}`, { method: 'PUT', body: rule })
  },
  search: {
    query: (q: string, cursor?: string | null) =>
      request<Page<Arc>>('search', { query: { q, cursor: cursor ?? null } })
  },
  onboarding: {
    registerDomain: (domain: string) =>
      request<DomainRegistration>('onboarding/domain', { method: 'POST', body: { domain } }),
    sendTestEmail: () =>
      request<TestEmail>('onboarding/test-email', { method: 'POST' }),
    testEmailStatus: (testId: string) =>
      request<TestEmailStatus>(`onboarding/test-email/${encodeURIComponent(testId)}/status`),
    setSender: (sender: string, displayName: string) =>
      request<void>('onboarding/sender', { method: 'POST', body: { sender, displayName } }),
    setFilterMode: (mode: FilterMode) =>
      request<void>('onboarding/filter-mode', { method: 'POST', body: { mode } }),
    complete: () =>
      request<void>('onboarding/complete', { method: 'POST' })
  }
};

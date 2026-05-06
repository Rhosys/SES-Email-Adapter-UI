import type {
  Account, Arc, Domain, DnsRecord, Label, Page, PageParams,
  Rule, RuleAction, Signal, View, ArcStatus, Workflow,
  EmailAddressConfig, SenderFilterMode, AccountFilteringConfig,
  VerifiedForwardingAddress
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

function acct(accountId: string): string {
  return `accounts/${encodeURIComponent(accountId)}`;
}

interface ListArcsParams extends PageParams {
  workflow?: Workflow;
  label?: string;
  status?: ArcStatus;
}

export const api = {
  account: {
    get: (accountId: string) =>
      request<Account>(acct(accountId)),
    update: (accountId: string, body: Partial<Pick<Account, 'name' | 'deletionRetentionDays' | 'notifications' | 'filtering'>>) =>
      request<{ ok: true }>(acct(accountId), { method: 'PATCH', body }),
    setFilterMode: (accountId: string, mode: SenderFilterMode, extra: Partial<AccountFilteringConfig> = {}) =>
      request<{ ok: true }>(acct(accountId), {
        method: 'PATCH',
        body: { filtering: { defaultFilterMode: mode, newAddressHandling: 'auto_allow', ...extra } }
      })
  },

  arcs: {
    list: (accountId: string, params: ListArcsParams = {}) =>
      request<Page<Arc>>(`${acct(accountId)}/arcs`, {
        query: {
          workflow: params.workflow,
          label: params.label,
          status: params.status,
          cursor: params.cursor,
          limit: params.limit
        }
      }),
    get: (accountId: string, id: string) =>
      request<Arc>(`${acct(accountId)}/arcs/${encodeURIComponent(id)}`),
    update: (accountId: string, id: string, body: { status?: ArcStatus; labels?: string[] }) =>
      request<{ ok: true }>(`${acct(accountId)}/arcs/${encodeURIComponent(id)}`, { method: 'PATCH', body }),
    createFromBlocked: (accountId: string, body: { signalId: string; approveSender?: boolean; updateFilterMode?: SenderFilterMode }) =>
      request<Arc>(`${acct(accountId)}/arcs`, { method: 'POST', body })
  },

  signals: {
    listByArc: (accountId: string, arcId: string, params: PageParams = {}) =>
      request<Page<Signal>>(`${acct(accountId)}/arcs/${encodeURIComponent(arcId)}/signals`, {
        query: { cursor: params.cursor, limit: params.limit }
      }),
    get: (accountId: string, id: string) =>
      request<Signal>(`${acct(accountId)}/signals/${encodeURIComponent(id)}`)
  },

  views: {
    list: (accountId: string) => request<View[]>(`${acct(accountId)}/views`),
    create: (accountId: string, body: { name: string; workflow?: Workflow; labels?: string[]; sortField?: View['sortField']; sortDirection?: View['sortDirection']; icon?: string; color?: string; position?: number }) =>
      request<View>(`${acct(accountId)}/views`, { method: 'POST', body }),
    update: (accountId: string, id: string, body: Partial<{ name: string; workflow?: Workflow; labels?: string[]; sortField: View['sortField']; sortDirection: View['sortDirection']; icon?: string; color?: string; position?: number }>) =>
      request<{ ok: true }>(`${acct(accountId)}/views/${encodeURIComponent(id)}`, { method: 'PATCH', body }),
    remove: (accountId: string, id: string) =>
      request<void>(`${acct(accountId)}/views/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    reorder: (accountId: string, orderedIds: string[]) =>
      request<{ ok: true }>(`${acct(accountId)}/views/reorder`, { method: 'POST', body: { orderedIds } })
  },

  labels: {
    list: (accountId: string) => request<Label[]>(`${acct(accountId)}/labels`),
    create: (accountId: string, body: { name: string; color?: string; icon?: string }) =>
      request<Label>(`${acct(accountId)}/labels`, { method: 'POST', body }),
    update: (accountId: string, id: string, body: Partial<{ name: string; color?: string; icon?: string }>) =>
      request<{ ok: true }>(`${acct(accountId)}/labels/${encodeURIComponent(id)}`, { method: 'PATCH', body }),
    remove: (accountId: string, id: string) =>
      request<void>(`${acct(accountId)}/labels/${encodeURIComponent(id)}`, { method: 'DELETE' })
  },

  rules: {
    list: (accountId: string) => request<Rule[]>(`${acct(accountId)}/rules`),
    create: (accountId: string, body: { name: string; condition: string; actions: RuleAction[]; position?: number }) =>
      request<Rule>(`${acct(accountId)}/rules`, { method: 'POST', body }),
    update: (accountId: string, id: string, body: Partial<{ name: string; condition: string; actions: RuleAction[]; position?: number }>) =>
      request<{ ok: true }>(`${acct(accountId)}/rules/${encodeURIComponent(id)}`, { method: 'PATCH', body }),
    remove: (accountId: string, id: string) =>
      request<void>(`${acct(accountId)}/rules/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    reorder: (accountId: string, orderedIds: string[]) =>
      request<{ ok: true }>(`${acct(accountId)}/rules/reorder`, { method: 'POST', body: { orderedIds } })
  },

  domains: {
    list: (accountId: string) =>
      request<Domain[]>(`${acct(accountId)}/domains`),
    create: (accountId: string, domain: string) =>
      request<Domain>(`${acct(accountId)}/domains`, { method: 'POST', body: { domain } }),
    records: (accountId: string, id: string) =>
      request<DnsRecord[]>(`${acct(accountId)}/domains/${encodeURIComponent(id)}/records`),
    remove: (accountId: string, id: string) =>
      request<void>(`${acct(accountId)}/domains/${encodeURIComponent(id)}`, { method: 'DELETE' })
  },

  emailConfigs: {
    list: (accountId: string) =>
      request<Record<string, EmailAddressConfig>>(`${acct(accountId)}/email-configs`),
    get: (accountId: string, address: string) =>
      request<EmailAddressConfig>(`${acct(accountId)}/email-configs/${encodeURIComponent(address)}`),
    upsert: (accountId: string, address: string, body: Partial<Omit<EmailAddressConfig, 'id' | 'accountId' | 'address' | 'createdAt' | 'updatedAt'>>) =>
      request<EmailAddressConfig>(`${acct(accountId)}/email-configs/${encodeURIComponent(address)}`, { method: 'PUT', body }),
    remove: (accountId: string, address: string) =>
      request<void>(`${acct(accountId)}/email-configs/${encodeURIComponent(address)}`, { method: 'DELETE' })
  },

  forwardingAddresses: {
    list: (accountId: string) =>
      request<VerifiedForwardingAddress[]>(`${acct(accountId)}/forwarding-addresses`),
    create: (accountId: string, address: string) =>
      request<VerifiedForwardingAddress>(`${acct(accountId)}/forwarding-addresses`, { method: 'POST', body: { address } }),
    verify: (accountId: string, address: string, token: string) =>
      request<{ ok: true }>(`${acct(accountId)}/forwarding-addresses/${encodeURIComponent(address)}/verify`, { method: 'POST', body: { token } }),
    remove: (accountId: string, address: string) =>
      request<void>(`${acct(accountId)}/forwarding-addresses/${encodeURIComponent(address)}`, { method: 'DELETE' })
  }
};

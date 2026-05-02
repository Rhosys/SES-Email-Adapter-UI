// Synced from rhosys/ses-email-adapter:src/types/index.ts
// (branch: claude/build-ai-app-ECGgR)
//
// This session does not have cross-repo read access, so the full type module
// must be synced manually by a maintainer who can read the server repo.
//
// Until then, the types below are a minimal subset that lets the UI compile
// and the API client be typed end-to-end. Replace this file wholesale with
// the contents of the server's `src/types/index.ts` once available.

export type Urgency = 'low' | 'normal' | 'high' | 'critical';

export type Workflow =
  | 'support'
  | 'sales'
  | 'billing'
  | 'quote'
  | 'invoice'
  | 'shipping'
  | 'other';

export type ArcStatus = 'open' | 'snoozed' | 'done' | 'quarantined';

export interface Label {
  id: string;
  name: string;
  color: string;
  icon?: string;
}

export interface Signal {
  id: string;
  arcId: string;
  from: string;
  to: string[];
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  receivedAt: string;
  workflow: Workflow;
  urgency: Urgency;
}

export interface Arc {
  id: string;
  subject: string;
  preview: string;
  workflow: Workflow;
  urgency: Urgency;
  status: ArcStatus;
  labels: Label[];
  lastSignalAt: string;
  signalCount: number;
}

export interface Pong {
  id: string;
  arcId: string;
  bodyMarkdown: string;
  sentAt: string | null;
  draft: boolean;
}

export interface Page<T> {
  items: T[];
  cursor: string | null;
}

export interface Account {
  id: string;
  email: string;
  displayName: string;
  domains: string[];
  onboardingComplete: boolean;
}

export interface Rule {
  id: string;
  name: string;
  conditions: unknown; // JSONLogic
  actions: Array<{ type: string; params: Record<string, unknown> }>;
  enabled: boolean;
}

// --- Onboarding -----------------------------------------------------------

export type DnsTier = 'apex' | 'sub';
export type DnsRecordType = 'CNAME' | 'MX' | 'TXT';
export type DnsPurpose = 'verification' | 'MX' | 'SPF' | 'DKIM' | 'DMARC';

export interface DnsRecord {
  tier: DnsTier;
  type: DnsRecordType;
  name: string;
  value: string;
  purpose: DnsPurpose;
  ttl?: number;
}

export interface DomainRegistration {
  domain: string;
  records: DnsRecord[];
  verified: boolean;
}

export type FilterMode = 'strict' | 'balanced' | 'permissive';

export interface TestEmail {
  testId: string;
  to: string;
}

export interface TestEmailStatus {
  received: boolean;
  signalId?: string;
  receivedAt?: string;
}

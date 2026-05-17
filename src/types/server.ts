// Synced from rhosys/ses-email-adapter backend src/types/index.ts
// Replace this file wholesale when a maintainer syncs from the server repo.

export type Workflow =
  | 'auth'
  | 'conversation'
  | 'crm'
  | 'package'
  | 'travel'
  | 'scheduling'
  | 'payments'
  | 'alert'
  | 'content'
  | 'status'
  | 'healthcare'
  | 'job'
  | 'support'
  | 'test'

export type ArcStatus = 'active' | 'archived' | 'deleted'

export type ArcUrgency = 'critical' | 'high' | 'normal' | 'low' | 'silent'

export interface RuleExecution {
  ruleId: string
  labels: string[]
  status: string
}

export interface Arc {
  id: string
  accountId: string
  groupingKey?: string
  workflow: Workflow
  labels: string[]
  status: ArcStatus
  summary: string
  lastSignalAt: string
  lastUserConfirmedAt?: string
  deletedAt?: string
  createdAt: string
  updatedAt: string
  ttl?: number
  sentMessageIds?: string[]
  urgency?: ArcUrgency
}

export interface Page<T> {
  items: T[]
  nextCursor?: string
}

export interface EmailNotificationSettings {
  enabled: boolean
  address: string
  frequency: 'instant' | 'hourly' | 'daily'
}

export interface PushNotificationSettings {
  enabled: boolean
}

export interface NotificationSettings {
  email?: EmailNotificationSettings
  push?: PushNotificationSettings
}

export type UnknownSenderPolicy =
  | 'allow_all'
  | 'quarantine_visible'
  | 'quarantine_hidden'
  | 'block_hidden'
  | 'block_reject'
  | 'violate_report'

export type SenderPolicy = 'allow' | 'block_hidden' | 'block_reject' | 'violate_report'

export interface AccountFilteringConfig {
  defaultUnknownSenderPolicy: UnknownSenderPolicy
}

export interface EmailAddressConfig {
  id: string
  accountId: string
  address: string
  unknownSenderPolicy: UnknownSenderPolicy
  createdAt: string
  updatedAt: string
}

// Per-sender disposition — managed via /aliases/:address/senders sub-resource
export interface AliasSender {
  domain: string
  policy: SenderPolicy
  addedAt: string
}

export interface OnboardingState {
  domainAdded?: boolean
  testEmailReceived?: boolean
  senderConfigured?: boolean
  completed: boolean
  featureTourCompleted?: boolean
}

export interface Account {
  id: string
  name: string
  deletionRetentionDays: number
  notifications?: NotificationSettings
  filtering?: AccountFilteringConfig
  emailConfigs?: Record<string, EmailAddressConfig>
  onboarding?: OnboardingState
  createdAt: string
  updatedAt: string
}

export interface Label {
  id: string
  accountId: string
  name: string
  color?: string
  icon?: string
  createdAt: string
}

// ─── Rules ────────────────────────────────────────────────────────────────────

export type RuleActionType =
  | 'assign_label'
  | 'assign_workflow'
  | 'archive'
  | 'delete'
  | 'forward'
  | 'block'
  | 'quarantine'
  | 'quarantine_hidden'
  | 'set_urgency'
  | 'suppress_notification'
  | 'pong'
  | 'approve_sender'
  | 'auto_reply'
  | 'auto_draft'

export interface RuleAction {
  type: RuleActionType
  labelId?: string
  workflow?: Workflow
  urgency?: ArcUrgency
  forwardTo?: string
  templateId?: string
}

// UI-only condition model — serialised to JSONLogic before sending to the API
export type ConditionField =
  | 'signal.from.address'
  | 'signal.from.domain'
  | 'signal.subject'
  | 'signal.workflow'
  | 'signal.spamScore'
  | 'arc.labels'
  | 'arc.urgency'
  | 'arc.status'

export type ConditionOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'not_contains'
  | 'starts_with'
  | 'ends_with'
  | 'greater_than'
  | 'less_than'

export interface ConditionLeaf {
  field: ConditionField
  operator: ConditionOperator
  value: string
}

export interface ConditionGroup {
  mode: 'and' | 'or'
  conditions: ConditionLeaf[]
}

export interface Rule {
  id: string
  accountId: string
  name: string
  status: 'enabled' | 'disabled'
  priorityOrder: number
  condition: string
  actions: RuleAction[]
  createdAt: string
  updatedAt: string
}

export interface CreateRuleBody {
  name: string
  status?: 'enabled' | 'disabled'
  condition: string
  actions: RuleAction[]
}

export type UpdateRuleBody = Partial<CreateRuleBody> & { priorityOrder?: number }

// ─── Signal ───────────────────────────────────────────────────────────────────

export type SignalStatus =
  | 'received'
  | 'processed'
  | 'failed'
  | 'quarantined'
  | 'quarantine_visible'
  | 'quarantine_hidden'
  | 'blocked'
  | 'block_hidden'
  | 'block_reject'
  | 'active'
  | 'draft'
export type SignalSource = 'ses' | 'api' | 'user' | 'system'

export interface EmailAddress {
  address: string
  name?: string
}

export interface Attachment {
  filename: string
  contentType: string
  size: number
  url?: string
}

export interface Signal {
  id: string
  arcId: string
  accountId: string
  status: SignalStatus
  source: SignalSource
  from: EmailAddress
  to: EmailAddress[]
  cc?: EmailAddress[]
  subject: string
  textBody?: string
  htmlBody?: string
  spamScore?: number
  receivedAt: string
  createdAt: string
  workflowData?: WorkflowData
  attachments?: Attachment[]
  matchedRules?: RuleExecution[]
}

// ─── WorkflowData union ───────────────────────────────────────────────────────

export interface AuthData {
  workflow: 'auth'
  authType: 'otp' | 'password_reset' | 'magic_link' | 'verification' | 'two_factor' | 'other'
  code?: string
  expiresInMinutes?: number
  service: string
  actionUrl?: string
}

export interface ConversationData {
  workflow: 'conversation'
  senderName?: string
  isReply: boolean
  threadLength?: number
  sentiment: 'positive' | 'neutral' | 'negative' | 'urgent'
  requiresReply: boolean
}

export interface CrmData {
  workflow: 'crm'
  crmType: 'sales_outreach' | 'follow_up' | 'client_message' | 'proposal' | 'contract' | 'support'
  senderCompany?: string
  senderRole?: string
  dealValue?: number
  currency?: string
  urgency: 'low' | 'medium' | 'high'
  requiresReply: boolean
}

export interface PackageData {
  workflow: 'package'
  packageType:
    | 'confirmation'
    | 'shipping'
    | 'out_for_delivery'
    | 'delivered'
    | 'return'
    | 'refund'
    | 'cancellation'
  retailer: string
  orderNumber?: string
  trackingNumber?: string
  trackingUrl?: string
  estimatedDelivery?: string
  items?: Array<{ name: string; quantity: number; price?: number }>
  totalAmount?: number
  currency?: string
}

export interface TravelData {
  workflow: 'travel'
  travelType:
    | 'flight'
    | 'hotel'
    | 'car_rental'
    | 'train'
    | 'cruise'
    | 'activity'
    | 'itinerary'
    | 'check_in_reminder'
    | 'boarding_pass'
  provider: string
  confirmationNumber?: string
  departureDate?: string
  returnDate?: string
  origin?: string
  destination?: string
  passengerName?: string
  totalAmount?: number
  currency?: string
}

export interface SchedulingData {
  workflow: 'scheduling'
  eventType:
    | 'meeting_invite'
    | 'appointment'
    | 'reminder'
    | 'cancellation'
    | 'reschedule'
    | 'confirmation'
  title: string
  startTime?: string
  endTime?: string
  location?: string
  organizer?: string
  attendees?: string[]
  calendarUrl?: string
  requiresResponse: boolean
}

export interface PaymentsData {
  workflow: 'payments'
  paymentType:
    | 'invoice'
    | 'receipt'
    | 'subscription_renewal'
    | 'payment_failed'
    | 'plan_changed'
    | 'tax'
    | 'wire_transfer'
    | 'refund'
    | 'statement'
    | 'other'
  vendor: string
  amount?: number
  currency?: string
  dueDate?: string
  invoiceNumber?: string
  accountLastFour?: string
  downloadUrl?: string
  managementUrl?: string
}

export interface AlertData {
  workflow: 'alert'
  alertType:
    | 'suspicious_login'
    | 'new_device'
    | 'password_changed'
    | 'breach_notice'
    | 'api_key_exposed'
    | 'account_locked'
    | 'fraud_alert'
    | 'ci_failure'
    | 'deployment_failed'
    | 'error_spike'
    | 'domain_expiry'
    | 'cert_expiry'
    | 'security_scan'
    | 'other'
  service: string
  severity?: 'info' | 'warning' | 'critical'
  requiresAction: boolean
  actionUrl?: string
  ipAddress?: string
  location?: string
  deviceName?: string
  repository?: string
  errorMessage?: string
}

export interface ContentData {
  workflow: 'content'
  contentType: 'newsletter' | 'promotion' | 'social_digest' | 'product_update' | 'announcement'
  publisher: string
  topics?: string[]
  discountCode?: string
  discountAmount?: string
  expiryDate?: string
  unsubscribeUrl?: string
}

export interface StatusData {
  workflow: 'status'
  statusType:
    | 'terms_update'
    | 'privacy_policy'
    | 'service_notice'
    | 'welcome'
    | 'government'
    | 'account_notification'
    | 'other'
  provider: string
  effectiveDate?: string
  referenceNumber?: string
  documentUrl?: string
}

export interface HealthcareData {
  workflow: 'healthcare'
  eventType:
    | 'appointment_reminder'
    | 'appointment_confirmation'
    | 'test_results'
    | 'prescription'
    | 'insurance_update'
    | 'billing'
    | 'referral'
  provider?: string
  appointmentDate?: string
  location?: string
  requiresAction: boolean
  portalUrl?: string
}

export interface JobData {
  workflow: 'job'
  jobType:
    | 'application_status'
    | 'recruiter_outreach'
    | 'interview_request'
    | 'offer'
    | 'rejection'
    | 'job_posting'
  company?: string
  role?: string
  location?: string
  salary?: string
  interviewDate?: string
  applicationStatus?: 'submitted' | 'reviewing' | 'interview' | 'offer' | 'rejected'
  actionUrl?: string
}

export interface SupportData {
  workflow: 'support'
  eventType:
    | 'ticket_opened'
    | 'ticket_updated'
    | 'ticket_resolved'
    | 'ticket_closed'
    | 'awaiting_response'
    | 'status_update'
  ticketId?: string
  service: string
  priority?: 'low' | 'normal' | 'high' | 'urgent'
  agentName?: string
  responseUrl?: string
}

export interface TestData {
  workflow: 'test'
  triggeredBy: 'user' | 'system'
}

export type WorkflowData =
  | AuthData
  | ConversationData
  | CrmData
  | PackageData
  | TravelData
  | SchedulingData
  | PaymentsData
  | AlertData
  | ContentData
  | StatusData
  | HealthcareData
  | JobData
  | SupportData
  | TestData

// ─── Draft signal (Reply composer) ───────────────────────────────────────────

export interface CreateDraftSignalBody {
  from: EmailAddress
  to: EmailAddress[]
  subject: string
  textBody?: string
}

export interface UpdateDraftSignalBody {
  from?: EmailAddress
  subject?: string
  textBody?: string
}

// ─── Saved views (Phase 6) ────────────────────────────────────────────────────

export interface SavedView {
  id: string
  accountId: string
  name: string
  icon?: string
  color?: string
  position: number
  workflow?: string
  labels?: string[]
  sortField?: string
  sortDirection?: string
  createdAt: string
  updatedAt: string
}

export interface CreateSavedViewBody {
  name: string
  icon?: string
  color?: string
  position?: number
  workflow?: string
  labels?: string[]
  sortField?: string
  sortDirection?: string
}

// ─── Domains (Phase 9) ────────────────────────────────────────────────────────

export type DnsRecordType = 'TXT' | 'MX' | 'CNAME'
export type DnsStatus = 'pending' | 'verified' | 'failed'

export interface DnsRecord {
  type: DnsRecordType
  host: string
  value: string
  ttl?: number
  status: DnsStatus
}

export interface Domain {
  id: string
  accountId: string
  domain: string
  status: DnsStatus
  dnsRecords: DnsRecord[]
  createdAt: string
  updatedAt: string
}

// ─── Forwarding addresses (Phase 9) ──────────────────────────────────────────

export interface ForwardingAddress {
  id: string
  accountId: string
  address: string
  status: 'pending' | 'verified'
  createdAt: string
}

// ─── Team members (Phase 9) ──────────────────────────────────────────────────

export type UserRole = 'owner' | 'admin' | 'member' | 'viewer'

export interface TeamMember {
  id: string
  accountId: string
  userId: string
  email: string
  name?: string
  role: UserRole
  status: 'active' | 'invited' | 'suspended'
  invitedAt: string
  joinedAt?: string
}

// ─── Audit log (Phase 10) ────────────────────────────────────────────────────

export type AuditAction = 'created' | 'updated' | 'deleted' | 'reordered'
export type AuditResourceType =
  | 'rule'
  | 'alias'
  | 'domain'
  | 'account'
  | 'label'
  | 'view'
  | 'template'
  | 'forwarding_address'

export interface AuditEvent {
  id: string
  accountId: string
  userId: string
  actorEmail?: string
  action: AuditAction
  resourceType: AuditResourceType
  resourceId?: string
  before?: unknown
  after?: unknown
  timestamp: string
}

// ─── Billing ──────────────────────────────────────────────────────────────────

export type BillingPlan = 'free' | 'starter' | 'pro'
export type BillingStatus = 'active' | 'trialing' | 'past_due' | 'canceled' | 'incomplete'

export interface BillingInfo {
  plan: BillingPlan
  status: BillingStatus
  currentPeriodEnd?: string
  cancelAtPeriodEnd?: boolean
  trialEnd?: string
}

// ─── Email templates ──────────────────────────────────────────────────────────

export interface TemplateFunction {
  name: string  // identifier used as {{fn.name}} in the template
  code: string  // JS expression: (signal, arc) => string
}

export interface EmailTemplate {
  id: string
  accountId: string
  name: string
  subject: string
  body: string
  functions: TemplateFunction[]
  createdAt: string
  updatedAt: string
}

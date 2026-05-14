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

export type SenderFilterMode = 'strict' | 'sender_match' | 'notify_new' | 'allow_all'

export interface AccountFilteringConfig {
  defaultFilterMode: SenderFilterMode
}

export interface EmailAddressConfig {
  id: string
  accountId: string
  address: string
  filterMode: SenderFilterMode
  approvedSenders: string[]
  // TODO(backend): add blockedSenders field to EmailAddressConfig and PATCH /aliases/:address support
  blockedSenders?: string[]
  createdAt: string
  updatedAt: string
}

export interface Account {
  id: string
  name: string
  deletionRetentionDays: number
  notifications?: NotificationSettings
  filtering?: AccountFilteringConfig
  emailConfigs?: Record<string, EmailAddressConfig>
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

// ─── Rules (Phase 7) ──────────────────────────────────────────────────────────
// TODO(backend): rules engine endpoints — POST/GET/PATCH/DELETE /accounts/:id/rules

export type RuleAction = 'allow' | 'block' | 'label' | 'quarantine'
export type RuleConditionField = 'from.address' | 'from.domain' | 'subject'
export type RuleConditionOperator = 'equals' | 'contains' | 'starts_with' | 'ends_with'

export interface RuleCondition {
  field: RuleConditionField
  operator: RuleConditionOperator
  value: string
}

export interface Rule {
  id: string
  accountId: string
  name: string
  conditions: RuleCondition[]
  action: RuleAction
  labelId?: string
  createdAt: string
  updatedAt: string
}

export interface CreateRuleBody {
  name: string
  conditions: RuleCondition[]
  action: RuleAction
  labelId?: string
}

// ─── Signal ───────────────────────────────────────────────────────────────────

export type SignalStatus =
  | 'received'
  | 'processed'
  | 'failed'
  | 'quarantined'
  | 'quarantine_visible'
  | 'quarantine_hidden'
  | 'blocked'
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

// ─── Rules additions ──────────────────────────────────────────────────────────

export interface UpdateRuleBody {
  name?: string
  conditions?: RuleCondition[]
  action?: RuleAction
  labelId?: string
}

// ─── Draft signal (Reply composer) ───────────────────────────────────────────

export interface CreateDraftSignalBody {
  status: 'draft'
  source: 'user'
  from: EmailAddress
  to: EmailAddress[]
  subject: string
  textBody?: string
  arcId?: string
}

export interface UpdateDraftSignalBody {
  from?: EmailAddress
  subject?: string
  textBody?: string
}

// ─── Saved views (Phase 6) ────────────────────────────────────────────────────

export interface SavedViewFilters {
  workflow?: string
  labelId?: string
  sender?: string
  status?: string
}

export interface SavedView {
  id: string
  accountId: string
  name: string
  icon?: string
  position: number
  filters: SavedViewFilters
  createdAt: string
  updatedAt: string
}

export interface CreateSavedViewBody {
  name: string
  icon?: string
  position?: number
  filters: SavedViewFilters
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
  label?: string
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

export type AuditEventType =
  | 'signal.quarantined'
  | 'signal.allowed'
  | 'signal.blocked'
  | 'rule.created'
  | 'rule.updated'
  | 'rule.deleted'
  | 'label.created'
  | 'label.updated'
  | 'label.deleted'
  | 'alias.created'
  | 'alias.updated'
  | 'alias.deleted'
  | 'user.invited'
  | 'user.role_changed'
  | 'user.removed'
  | 'account.updated'

export interface AuditEvent {
  id: string
  accountId: string
  actorId: string
  actorEmail?: string
  type: AuditEventType
  resourceType: string
  resourceId?: string
  metadata?: Record<string, unknown>
  createdAt: string
}

// Verbatim mirror of the backend API contract at:
// https://api.email.rhosys.cloud/.well-known/api-catalog
// Do NOT add fields that don't exist in the wire shape.

// ─── Enums & Shared Types ─────────────────────────────────────────────────────

export type Workflow =
  | 'auth'
  | 'conversation'
  | 'crm'
  | 'package'
  | 'travel'
  | 'payments'
  | 'alert'
  | 'content'
  | 'onboarding'
  | 'status'
  | 'healthcare'
  | 'job'
  | 'support'
  | 'test'

export type ArcStatus = 'active' | 'archived' | 'deleted' | 'report_violation'

export type ArcUrgency = 'critical' | 'high' | 'normal' | 'low' | 'silent'

export type SignalStatus =
  | 'active'
  | 'block_hidden'
  | 'block_reject'
  | 'report_violation'
  | 'quarantine_visible'
  | 'quarantine_hidden'
  | 'draft'
  | 'pending_send'
  | 'sent'

export type QuarantineStatus = 'quarantine_visible' | 'quarantine_hidden'

export type SignalSource = 'system' | 'user'

export type RetentionDuration = 'P1M' | 'P2M' | 'P3M' | 'P5M' | 'P6M' | 'P1Y' | 'P2Y' | 'P5Y' | 'P10Y' | 'P100Y' | 'Infinity'

export type UnknownSenderPolicy =
  | 'allow_all'
  | 'quarantine_visible'
  | 'quarantine_hidden'
  | 'block_hidden'
  | 'block_reject'
  | 'report_violation'

export type SenderPolicy = 'allow' | 'block_hidden' | 'block_reject' | 'report_violation'

export type UserRole = 'admin' | 'member' | 'viewer'

export type RuleActionType =
  | 'assign_label'
  | 'assign_workflow'
  | 'archive'
  | 'forward'
  | 'block_hidden'
  | 'block_reject'
  | 'quarantine'
  | 'quarantine_hidden'
  | 'set_urgency'
  | 'suppress_notification'
  | 'pong'
  | 'approve_sender'
  | 'auto_draft'
  | 'webhook'
  | 'forwardCalendarInvite'

// ─── Account ──────────────────────────────────────────────────────────────────

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

export interface AccountFilteringConfig {
  defaultUnknownSenderPolicy: UnknownSenderPolicy
}

export interface AccountOnboarding {
  completed: boolean
  completedAt?: string
  testEmailReceived?: boolean
  testEmailReceivedAt?: string
}

export interface Account {
  accountId: string
  name: string
  retentionDuration?: RetentionDuration
  notifications?: NotificationSettings
  filtering: AccountFilteringConfig
  onboarding?: AccountOnboarding
  billingPlan?: string
  defaultCalendarInviteForwardingTargetId?: string
  digest?: { frequency: 'daily' | 'weekly' | 'monthly'; forwardingTargetId: string } | null
  createdAt: string
  updatedAt: string
}

// ---------------------------------------------------------------------------
// User Configuration (per-user, global — not account-scoped)
// ---------------------------------------------------------------------------

export type PostSendView = 'return_to_inbox' | 'stay_on_thread'

export interface UserConfiguration {
  postSendView: PostSendView
}

// ─── Arc ──────────────────────────────────────────────────────────────────────

export interface Arc {
  arcId: string
  workflow: Workflow
  labels: string[]
  status: ArcStatus
  summary: string
  lastSignalAt: string
  deletedAt?: string
  createdAt: string
  updatedAt: string
  retentionDuration?: RetentionDuration
  urgency?: ArcUrgency
  // Denormalised from latest inbound signal — backend TODO pending
  senderAddress?: string
  recipientAddress?: string
  subject?: string
}

// ─── Signal (Discriminated Union) ─────────────────────────────────────────────

export interface SignalBase {
  signalId: string
  arcId?: string
  source: SignalSource
  status: SignalStatus
  createdAt: string
}

// Email types

export interface EmailAddress {
  address: string
  name?: string
}

export interface Attachment {
  attachmentId: string
  filename: string
  mimeType: string
  sizeBytes: number
  url?: string
}

export interface MatchedRuleAction {
  type: RuleActionType
  value?: string
}

export interface MatchedRuleResult {
  ruleId: string
  actions: MatchedRuleAction[]
  labelsAdded: string[]
  statusChange?: string
  text?: string
}

export type UnsubscribeMethod = 'server' | 'website' | 'mailto'

export interface UnsubscribeInfo {
  type: UnsubscribeMethod
  url: string
}

export interface InboundEmailSignalData {
  receivedAt: string
  summary: string
  urgency?: ArcUrgency
  from: EmailAddress
  to: EmailAddress[]
  cc: EmailAddress[]
  replyTo?: EmailAddress
  subject: string
  body?: string
  attachments: Attachment[]
  headers: Record<string, string>
  recipientAddress: string
  workflow: Workflow
  workflowData?: WorkflowData
  spamScore: number
  matchedRules?: MatchedRuleResult[]
  unsubscribe?: UnsubscribeInfo
}

export interface OutboundEmailSignalData {
  from: EmailAddress
  to: EmailAddress[]
  cc: EmailAddress[]
  bcc: EmailAddress[]
  replyTo?: EmailAddress
  subject: string
  body?: string
  attachments: Attachment[]
  sentAt?: string
  sendInitiatedAt: string
  sendFailureReason?: string
}

export interface EmailInboundSignal extends SignalBase {
  type: 'email'
  data: InboundEmailSignalData
}

export interface EmailOutboundSignal extends SignalBase {
  type: 'email'
  data: OutboundEmailSignalData
}

// Deliverability

export interface DeliverabilitySignalData {
  linkedSignalId: string
  bouncedRecipients: Array<{
    address: string
    bounceType: 'permanent' | 'transient'
    reason?: string
  }>
  subject: string
}

export interface DeliverabilitySignal extends SignalBase {
  type: 'deliverability'
  data: DeliverabilitySignalData
}

// Invalid rule function

export interface InvalidRuleFunctionData {
  resourceName: string
  issue: string
}

export interface InvalidRuleFunctionSignal extends SignalBase {
  type: 'invalid_rule_function'
  data: InvalidRuleFunctionData
}

// Invalid template function

export interface InvalidTemplateFunctionData {
  resourceName: string
  functionName: string
  issue: string
}

export interface InvalidTemplateFunctionSignal extends SignalBase {
  type: 'invalid_template_function'
  data: InvalidTemplateFunctionData
}

// Auto send blocked

export interface AutoSendBlockedData {
  recipientAddress: string
  reason?: string
}

export interface AutoSendBlockedSignal extends SignalBase {
  type: 'auto_send_blocked'
  data: AutoSendBlockedData
}

// Calendar event

export interface CalendarAttendee {
  address: string
  name?: string
  rsvpStatus?: string
  optional?: boolean
}

export interface CalendarEventData {
  title: string
  description?: string
  startTime: string
  endTime?: string
  location?: string
  url?: string
  organizer: string
  organizerName?: string
  attendees: CalendarAttendee[]
  linkedSignalId: string
}

export interface CalendarEventSignal extends SignalBase {
  type: 'calendar_event'
  data: CalendarEventData
}

// Calendar response

export interface CalendarResponseData {
  rsvpResponse: 'accepted' | 'declined' | 'tentative'
  respondedAt: string
  linkedSignalId: string
}

export interface CalendarResponseSignal extends SignalBase {
  type: 'calendar_response'
  data: CalendarResponseData
}

// Calendar invite invalid

export interface CalendarInviteInvalidData {
  reason: string
  linkedSignalId: string
}

export interface CalendarInviteInvalidSignal extends SignalBase {
  type: 'calendar_invite_invalid'
  data: CalendarInviteInvalidData
}

// Domain misconfiguration

export interface DomainMisconfigurationData {
  reason: string
  linkedSignalId: string
  aliasAddress: string
  domain: string
}

export interface DomainMisconfigurationSignal extends SignalBase {
  type: 'domain_misconfiguration'
  data: DomainMisconfigurationData
}

// Signal union

export type Signal =
  | EmailInboundSignal
  | EmailOutboundSignal
  | DeliverabilitySignal
  | InvalidRuleFunctionSignal
  | InvalidTemplateFunctionSignal
  | AutoSendBlockedSignal
  | CalendarEventSignal
  | CalendarResponseSignal
  | CalendarInviteInvalidSignal
  | DomainMisconfigurationSignal

export type SignalType = Signal['type']

export type QuarantinedSignal = Signal & { status: QuarantineStatus }

// ─── WorkflowData union ───────────────────────────────────────────────────────

export interface AuthData {
  workflow: 'auth'
  authType: 'otp' | 'password_reset' | 'magic_link' | 'verification' | 'two_factor' | 'security_alert' | 'other'
  code?: string
  expiresInMinutes?: number
  service: string
  actionUrl?: string
}

export interface ConversationData {
  workflow: 'conversation'
  sentiment: 'positive' | 'neutral' | 'negative' | 'urgent'
  requiresReply: boolean
}

export interface CrmData {
  workflow: 'crm'
  senderCompany?: string
  senderRole?: string
}

export interface PackageData {
  workflow: 'package'
  packageType: 'confirmation' | 'shipping' | 'out_for_delivery' | 'delivered' | 'return' | 'refund' | 'cancellation'
  retailer: string
  orderNumber?: string
  trackingNumber?: string
  trackingUrl?: string
  estimatedDelivery?: string
  items?: Array<{ name: string; quantity: number; price?: number }>
}

export interface TravelData {
  workflow: 'travel'
  travelType: 'flight' | 'hotel' | 'car_rental' | 'train' | 'cruise' | 'activity' | 'itinerary' | 'check_in_reminder' | 'boarding_pass'
  provider: string
  confirmationNumber?: string
  departureDate?: string
  returnDate?: string
  origin?: string
  destination?: string
  passengers?: Array<{ name: string }>
  totalAmount?: number
  currency?: string
}

export interface PaymentsData {
  workflow: 'payments'
  paymentType: 'invoice' | 'receipt' | 'subscription_renewal' | 'payment_failed' | 'plan_changed' | 'tax' | 'wire_transfer' | 'refund' | 'statement' | 'other'
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
  alertType: 'suspicious_login' | 'new_device' | 'password_changed' | 'breach_notice' | 'api_key_exposed' | 'account_locked' | 'fraud_alert' | 'ci_failure' | 'deployment_failed' | 'error_spike' | 'domain_expiry' | 'cert_expiry' | 'security_scan' | 'other'
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
}

export interface StatusData {
  workflow: 'status'
  statusType: 'terms_update' | 'privacy_policy' | 'data_processor' | 'cookie_policy' | 'compliance' | 'service_notice' | 'government' | 'account_notification' | 'other'
  provider: string
  effectiveDate?: string
  referenceNumber?: string
  documentUrl?: string
}

export interface HealthcareData {
  workflow: 'healthcare'
  eventType: 'appointment_reminder' | 'appointment_confirmation' | 'test_results' | 'prescription' | 'insurance_update' | 'billing' | 'referral'
  provider?: string
  appointmentDate?: string
  location?: string
  requiresAction: boolean
  portalUrl?: string
}

export interface JobData {
  workflow: 'job'
  jobType: 'application_status' | 'recruiter_outreach' | 'interview_request' | 'offer' | 'rejection' | 'job_posting'
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
  eventType: 'ticket_opened' | 'ticket_updated' | 'ticket_resolved' | 'ticket_closed' | 'awaiting_response' | 'status_update'
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
  | PaymentsData
  | AlertData
  | ContentData
  | StatusData
  | HealthcareData
  | JobData
  | SupportData
  | TestData

// ─── Rule ─────────────────────────────────────────────────────────────────────

export interface RuleAction {
  type: RuleActionType
  value?: string
  disabled?: boolean
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
  ruleId: string
  name: string
  condition?: string
  conditionType?: 'json_logic' | 'js'
  actions: RuleAction[]
  status: 'enabled' | 'disabled'
  priorityOrder: number
  system?: boolean
  createdAt: string
  updatedAt: string
}

export interface CreateRuleBody {
  name: string
  status?: 'enabled' | 'disabled'
  condition?: string
  conditionType?: 'json_logic' | 'js'
  actions: RuleAction[]
}

export type UpdateRuleBody = Partial<CreateRuleBody> & { priorityOrder?: number }

// ─── Domain + DnsRecord ───────────────────────────────────────────────────────

export type DnsRecordType = 'CNAME' | 'MX' | 'TXT'
export type DnsStatus = 'verified' | 'failing' | 'pending'

export interface DnsRecord {
  name: string
  type: DnsRecordType
  value: string
  currentValue?: string
  status: DnsStatus
}

export interface Domain {
  domainId: string
  domain: string
  receivingSetupComplete: boolean
  senderSetupComplete: boolean
  createdAt: string
  updatedAt: string
}

export interface DomainWithRecords extends Domain {
  records: DnsRecord[]
}

// ─── View ─────────────────────────────────────────────────────────────────────

export interface View {
  viewId: string
  name: string
  icon?: string
  color?: string
  workflow?: Workflow
  labels: string[]
  sortField: 'lastSignalAt' | 'createdAt'
  sortDirection: 'asc' | 'desc'
  position: number
  layout?: unknown[]
  createdAt: string
  updatedAt: string
}

export interface CreateViewBody {
  name: string
  icon?: string
  color?: string
  position?: number
  workflow?: Workflow
  labels?: string[]
  sortField?: 'lastSignalAt' | 'createdAt'
  sortDirection?: 'asc' | 'desc'
}

// ─── Label ────────────────────────────────────────────────────────────────────

export interface Label {
  label: string
  name: string
  color?: string
  icon?: string
  createdAt: string
}

// ─── ForwardingTarget ─────────────────────────────────────────────────────────

export interface ForwardingTarget {
  target: string
  type: 'email' | 'webhook'
  status: 'pending' | 'verified' | 'disabled'
  createdAt: string
  verifiedAt?: string
}

// ─── TeamMember ───────────────────────────────────────────────────────────────

export interface TeamMember {
  userId: string
  role: UserRole
  // Profile fields — populated once backend resolves from Authress
  name?: string
  email?: string
  picture?: string
}

// ─── Alias ────────────────────────────────────────────────────────────────────

export interface Alias {
  alias: string
  address: string
  unknownSenderPolicy: UnknownSenderPolicy
  createdAt: string
  updatedAt: string
}

export interface AliasSender {
  alias: string
  sender: string
  policy: SenderPolicy
  createdAt: string
  updatedAt: string
}

// ─── Email Template ───────────────────────────────────────────────────────────

export interface TemplateFunction {
  name: string
  code: string
  lastError?: string
}

export interface EmailTemplate {
  templateId: string
  name: string
  subject: string
  body: string
  functions?: TemplateFunction[]
  createdAt: string
  updatedAt: string
}

// ─── Audit ────────────────────────────────────────────────────────────────────

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

// ─── Pagination ───────────────────────────────────────────────────────────────

export interface Pagination {
  cursor: string | null
}

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

// ─── Stats ──────────────────────────────────────────────────────────────────

export interface StatsTotals {
  allowed: number
  quarantined: number
  blocked: number
  aliases: number
}

export interface StatsDailyBucket {
  date: string
  allowed: number
  quarantined: number
  blocked: number
  aliases: number
}

export interface StatsResponse {
  totals: StatsTotals
  daily: StatsDailyBucket[]
  monthly: StatsDailyBucket[]
}

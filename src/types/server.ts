// Synced verbatim from rhosys/ses-email-adapter:src/types/index.ts
// (branch: claude/build-ai-app-ECGgR). When the server's type module
// changes, replace this file wholesale.

// ---------------------------------------------------------------------------
// Workflows (the kind of email this is — drives display, UX, and actions)
// ---------------------------------------------------------------------------

export const WORKFLOWS = [
  "auth",          // OTPs, magic links, password resets, 2FA codes — copy/click, expires
  "conversation",  // Human-to-human back-and-forth — read and reply
  "crm",           // Sales outreach, proposals, client emails, follow-ups — reply or dismiss
  "package",       // Order confirmations, shipping, delivery tracking — track or file
  "travel",        // Flights, hotels, itineraries, boarding passes — date-triggered actions
  "scheduling",    // Calendar invites, appointment confirmations — accept or decline
  "payments",      // Invoices, receipts, subscriptions, tax, bank statements — pay or file
  "alert",         // Security events, fraud, CI failures, infra alerts — investigate now
  "content",       // Newsletters, promotions, social digests — read or unsubscribe
  "status",        // ToS updates, service notices, welcome emails, government — passive
  "healthcare",    // Appointments, test results, prescriptions, insurance
  "job",           // Applications, interviews, offers, rejections — career pipeline
  "support",       // Helpdesk tickets with threaded conversation and ticket ID
  "test",          // Emails sent by the account owner to their own domain — triggers pong
] as const;

export type Workflow = (typeof WORKFLOWS)[number];

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
  | TestData;

export interface AuthData {
  workflow: "auth";
  authType: "otp" | "password_reset" | "magic_link" | "verification" | "two_factor" | "other";
  code?: string;
  expiresInMinutes?: number;
  service: string;
  actionUrl?: string;
}

export interface ConversationData {
  workflow: "conversation";
  senderName?: string;
  isReply: boolean;
  threadLength?: number;
  sentiment: "positive" | "neutral" | "negative" | "urgent";
  requiresReply: boolean;
}

export interface CrmData {
  workflow: "crm";
  crmType: "sales_outreach" | "follow_up" | "client_message" | "proposal" | "contract" | "support";
  senderCompany?: string;
  senderRole?: string;
  dealValue?: number;
  currency?: string;
  urgency: "low" | "medium" | "high";
  requiresReply: boolean;
}

export interface PackageData {
  workflow: "package";
  packageType: "confirmation" | "shipping" | "out_for_delivery" | "delivered" | "return" | "refund" | "cancellation";
  retailer: string;
  orderNumber?: string;
  trackingNumber?: string;
  trackingUrl?: string;
  estimatedDelivery?: string;
  items?: Array<{ name: string; quantity: number; price?: number }>;
  totalAmount?: number;
  currency?: string;
}

export interface TravelData {
  workflow: "travel";
  travelType: "flight" | "hotel" | "car_rental" | "train" | "cruise" | "activity" | "itinerary" | "check_in_reminder" | "boarding_pass";
  provider: string;
  confirmationNumber?: string;
  departureDate?: string;
  returnDate?: string;
  origin?: string;
  destination?: string;
  passengerName?: string;
  totalAmount?: number;
  currency?: string;
}

export interface SchedulingData {
  workflow: "scheduling";
  eventType: "meeting_invite" | "appointment" | "reminder" | "cancellation" | "reschedule" | "confirmation";
  title: string;
  startTime?: string;
  endTime?: string;
  location?: string;
  organizer?: string;
  attendees?: string[];
  calendarUrl?: string;
  requiresResponse: boolean;
}

export interface PaymentsData {
  workflow: "payments";
  paymentType: "invoice" | "receipt" | "subscription_renewal" | "payment_failed" | "plan_changed" | "tax" | "wire_transfer" | "refund" | "statement" | "other";
  vendor: string;
  amount?: number;
  currency?: string;
  dueDate?: string;
  invoiceNumber?: string;
  accountLastFour?: string;
  downloadUrl?: string;
  managementUrl?: string;
}

export interface AlertData {
  workflow: "alert";
  alertType:
    | "suspicious_login" | "new_device" | "password_changed" | "breach_notice"
    | "api_key_exposed" | "account_locked" | "fraud_alert"
    | "ci_failure" | "deployment_failed" | "error_spike"
    | "domain_expiry" | "cert_expiry" | "security_scan"
    | "other";
  service: string;
  severity?: "info" | "warning" | "critical";
  requiresAction: boolean;
  actionUrl?: string;
  ipAddress?: string;
  location?: string;
  deviceName?: string;
  repository?: string;
  errorMessage?: string;
}

export interface ContentData {
  workflow: "content";
  contentType: "newsletter" | "promotion" | "social_digest" | "product_update" | "announcement";
  publisher: string;
  topics?: string[];
  discountCode?: string;
  discountAmount?: string;
  expiryDate?: string;
  unsubscribeUrl?: string;
}

export interface StatusData {
  workflow: "status";
  statusType: "terms_update" | "privacy_policy" | "service_notice" | "welcome" | "government" | "account_notification" | "other";
  provider: string;
  effectiveDate?: string;
  referenceNumber?: string;
  documentUrl?: string;
}

export interface HealthcareData {
  workflow: "healthcare";
  eventType: "appointment_reminder" | "appointment_confirmation" | "test_results" | "prescription" | "insurance_update" | "billing" | "referral";
  provider?: string;
  appointmentDate?: string;
  location?: string;
  requiresAction: boolean;
  portalUrl?: string;
}

export interface JobData {
  workflow: "job";
  jobType: "application_status" | "recruiter_outreach" | "interview_request" | "offer" | "rejection" | "job_posting";
  company?: string;
  role?: string;
  location?: string;
  salary?: string;
  interviewDate?: string;
  applicationStatus?: "submitted" | "reviewing" | "interview" | "offer" | "rejected";
  actionUrl?: string;
}

export interface SupportData {
  workflow: "support";
  eventType: "ticket_opened" | "ticket_updated" | "ticket_resolved" | "ticket_closed" | "awaiting_response" | "status_update";
  ticketId?: string;
  service: string;
  priority?: "low" | "normal" | "high" | "urgent";
  agentName?: string;
  responseUrl?: string;
}

export interface TestData {
  workflow: "test";
  triggeredBy: "user" | "system";
}

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------

export type NewAddressHandling = "auto_allow" | "block_until_approved";

export type SenderFilterMode = "strict" | "sender_match" | "notify_new" | "allow_all";

export type SignalStatus = "active" | "blocked" | "quarantined";
export type SignalSource = "email" | "system" | "user";
export type BlockReason = "new_sender" | "spam" | "sender_mismatch" | "reputation" | "onboarding";

export type BlockDisposition = { [K in BlockReason]?: "block" | "quarantine"; };

export type PushPriority = "interrupt" | "ambient" | "silent";

export type ArcUrgency = "critical" | "high" | "normal" | "low" | "silent";

export interface EmailAddressConfig {
  id: string;
  accountId: string;
  address: string;
  filterMode: SenderFilterMode;
  approvedSenders: string[];
  onboardingEmailHandling?: "block" | "quarantine" | "allow" | "inherit";
  spamScoreThreshold?: number;
  sourceUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AccountFilteringConfig {
  defaultFilterMode: SenderFilterMode;
  newAddressHandling: NewAddressHandling;
  blockOnboardingEmails?: boolean;
  blockDisposition?: BlockDisposition;
  spamScoreThreshold?: number;
}

export interface GlobalSenderReputation {
  domain: string;
  verdict?: "allow" | "deny";
  verdictReason?: string;
  signalCount: number;
  spamCount: number;
  blockCount: number;
  lastSeenAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Core email primitives
// ---------------------------------------------------------------------------

export interface EmailAddress {
  address: string;
  name?: string;
}

export interface Attachment {
  filename: string;
  mimeType: string;
  sizeBytes: number;
  s3Key: string;
  contentId?: string;
}

// ---------------------------------------------------------------------------
// Signal
// ---------------------------------------------------------------------------

export interface Signal {
  id: string;
  arcId?: string;
  accountId: string;
  source: SignalSource;
  receivedAt: string;
  from: EmailAddress;
  to: EmailAddress[];
  cc: EmailAddress[];
  replyTo?: EmailAddress;
  subject: string;
  sentAt?: string;
  textBody?: string;
  htmlBody?: string;
  attachments: Attachment[];
  headers: Record<string, string>;
  recipientAddress: string;
  workflow: Workflow;
  workflowData: WorkflowData;
  spamScore: number;
  summary: string;
  classificationModelId: string;
  s3Key: string;
  status: SignalStatus;
  blockReason?: BlockReason;
  createdAt: string;
  ttl?: number;
}

// ---------------------------------------------------------------------------
// Arc
// ---------------------------------------------------------------------------

export type ArcStatus = "active" | "archived" | "deleted";

export interface Arc {
  id: string;
  accountId: string;
  groupingKey?: string;
  workflow: Workflow;
  labels: string[];
  status: ArcStatus;
  summary: string;
  lastSignalAt: string;
  lastUserConfirmedAt?: string;
  deletedAt?: string;
  createdAt: string;
  updatedAt: string;
  ttl?: number;
  sentMessageIds?: string[];
  urgency?: ArcUrgency;
}

// ---------------------------------------------------------------------------
// View
// ---------------------------------------------------------------------------

export type SortField = "lastSignalAt" | "createdAt";
export type SortDirection = "asc" | "desc";

export interface View {
  id: string;
  accountId: string;
  name: string;
  icon?: string;
  color?: string;
  workflow?: Workflow;
  labels: string[];
  sortField: SortField;
  sortDirection: SortDirection;
  position: number;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Label
// ---------------------------------------------------------------------------

export interface Label {
  id: string;
  accountId: string;
  name: string;
  color?: string;
  icon?: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Rule
// ---------------------------------------------------------------------------

export type RuleActionType = "assign_label" | "assign_workflow" | "archive" | "delete" | "forward";

export interface RuleAction {
  type: RuleActionType;
  value?: string;
  disabled?: boolean;
}

export interface VerifiedForwardingAddress {
  id: string;
  accountId: string;
  address: string;
  status: "pending" | "verified";
  token: string;
  createdAt: string;
  verifiedAt?: string;
}

export interface Rule {
  id: string;
  accountId: string;
  name: string;
  condition: string;
  actions: RuleAction[];
  position: number;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export interface EmailNotificationSettings {
  enabled: boolean;
  address: string;
  frequency: "instant" | "hourly" | "daily";
}

export interface PushNotificationSettings {
  enabled: boolean;
}

export interface NotificationSettings {
  email?: EmailNotificationSettings;
  push?: PushNotificationSettings;
}

// ---------------------------------------------------------------------------
// Account
// ---------------------------------------------------------------------------

export interface Account {
  id: string;
  name: string;
  deletionRetentionDays: number;
  notifications?: NotificationSettings;
  filtering?: AccountFilteringConfig;
  emailConfigs?: Record<string, EmailAddressConfig>;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Domain
// ---------------------------------------------------------------------------

export interface DnsRecord {
  name: string;
  type: "CNAME" | "MX" | "TXT";
  value: string;
  currentValue?: string;
  status: "verified" | "failing" | "pending";
}

export interface Domain {
  id: string;
  accountId: string;
  domain: string;
  receivingSetupComplete: boolean;
  senderSetupComplete: boolean;
  receivingHealthy?: boolean;
  senderHealthy?: boolean;
  failingRecords?: string[];
  lastCheckedAt?: string;
  lastHealthyAt?: string;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

export interface PageParams {
  cursor?: string;
  limit?: number;
}

export interface Page<T> {
  items: T[];
  nextCursor?: string;
  total: number;
}

// ---------------------------------------------------------------------------
// Suppression list
// ---------------------------------------------------------------------------

export type SuppressionReason = "hard_bounce" | "soft_bounce" | "complaint" | "manual";

export interface SuppressedAddress {
  address: string;
  reason: SuppressionReason;
  suppressedAt: string;
  ttl?: number;
}

// ---------------------------------------------------------------------------
// SES feedback
// ---------------------------------------------------------------------------

export interface SesFeedback {
  notificationType: "Bounce" | "Complaint" | "Delivery";
  bounce?: {
    bounceType: "Permanent" | "Transient" | "Undetermined";
    bounceSubType: string;
    bouncedRecipients: Array<{ emailAddress: string; status?: string; action?: string }>;
    timestamp: string;
  };
  complaint?: {
    complainedRecipients: Array<{ emailAddress: string }>;
    complaintFeedbackType?: string;
    timestamp: string;
  };
  mail: { messageId: string; source: string; tags?: Record<string, string> };
}

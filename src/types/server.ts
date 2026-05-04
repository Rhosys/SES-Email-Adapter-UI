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
  total: number
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

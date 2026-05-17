// Realtime WebSocket event shapes.
//
// Design principle: include enough to render a useful notification and
// invalidate/update the right store slice — but not the full entity.
// All events carry the relevant IDs so the client can fetch the full
// object if needed.

import type { ArcUrgency } from './server'

interface EmailAddress {
  address: string
  name?: string
}

// ── Arc events ────────────────────────────────────────────────────────────────

export interface ArcCreatedEvent {
  type: 'arc:created'
  arcId: string
  urgency: ArcUrgency
  summary: string
  workflow: string
  labels: string[]
}

export interface ArcUpdatedEvent {
  type: 'arc:updated'
  arcId: string
  urgency?: ArcUrgency   // present when urgency changed
  status?: string        // present when status changed
  labels?: string[]      // present when labels changed
}

export interface ArcArchivedEvent {
  type: 'arc:archived'
  arcId: string
}

// ── Signal events ─────────────────────────────────────────────────────────────

export interface SignalCreatedEvent {
  type: 'signal:created'
  signalId: string
  arcId: string
  urgency: ArcUrgency   // urgency as computed for this arc after the new signal
  from: EmailAddress
  subject: string
}

export interface SignalUpdatedEvent {
  type: 'signal:updated'
  signalId: string
  arcId: string
  status?: string
}

// ── Quarantine events ─────────────────────────────────────────────────────────

export interface QuarantineCreatedEvent {
  type: 'quarantine:created'
  signalId: string
  from: EmailAddress
  subject: string
}

// ── Rule events ───────────────────────────────────────────────────────────────

export interface RuleCreatedEvent  { type: 'rule:created';  ruleId: string }
export interface RuleUpdatedEvent  { type: 'rule:updated';  ruleId: string }
export interface RuleDeletedEvent  { type: 'rule:deleted';  ruleId: string }

// ── Union ─────────────────────────────────────────────────────────────────────

export type RealtimeEvent =
  | ArcCreatedEvent
  | ArcUpdatedEvent
  | ArcArchivedEvent
  | SignalCreatedEvent
  | SignalUpdatedEvent
  | QuarantineCreatedEvent
  | RuleCreatedEvent
  | RuleUpdatedEvent
  | RuleDeletedEvent

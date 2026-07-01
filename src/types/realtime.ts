// Realtime WebSocket event shapes.
//
// Two events cover all meaningful real-time user-facing changes.
// Everything else (rules, labels, archived status) is re-fetched on
// navigation or page focus.

import type { ThreadUrgency } from './server'

export interface SignalCreatedEvent {
  type: 'signal:created'
  threadId: string
  signalId: string
  urgency: ThreadUrgency   // urgency of the thread after this signal lands
  from: { address: string; name?: string }
  subject: string
}

export interface ThreadUpdatedEvent {
  type: 'thread:updated'
  threadId: string
}

export type RealtimeEvent = SignalCreatedEvent | ThreadUpdatedEvent

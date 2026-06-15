// Realtime WebSocket event shapes.
//
// Two events cover all meaningful real-time user-facing changes.
// Everything else (rules, labels, archived status) is re-fetched on
// navigation or page focus.

import type { ArcUrgency } from './server'

export interface SignalCreatedEvent {
  type: 'signal:created'
  arcId: string
  signalId: string
  urgency: ArcUrgency   // urgency of the thread after this signal lands
  from: { address: string; name?: string }
  subject: string
}

export interface ArcUpdatedEvent {
  type: 'arc:updated'
  arcId: string
}

export type RealtimeEvent = SignalCreatedEvent | ArcUpdatedEvent

// Realtime WebSocket event shapes.
//
// The server emits `thread:updated` for all meaningful real-time changes.
// Everything else (rules, labels, archived status) is re-fetched on
// navigation or page focus.

import type { ThreadUrgency } from './server'

export interface SignalCreatedEvent {
  type: 'thread:updated'
  threadId: string
  signalId?: string
  urgency: ThreadUrgency   // urgency of the thread after this signal lands
  from: { address: string; name?: string }
  subject: string
}

export interface ThreadUpdatedEvent {
  type: 'thread:updated'
  threadId: string
}

// Server reply to every `ping` frame — confirms the socket round-trips.
export interface ConnectedEvent {
  type: 'connected'
  accountId: string
  connectionId: string
  timestamp: string
}

export type RealtimeEvent = SignalCreatedEvent | ThreadUpdatedEvent | ConnectedEvent

// Frames the client sends to the server.
export interface PingFrame {
  type: 'ping'
}

export type ClientFrame = PingFrame

// Messages the realtime SharedWorker posts to each tab.
export interface WorkerStatusMessage {
  type: 'status'
  connected: boolean
  code?: number
  reason?: string
  wasClean?: boolean
  hint?: string
}

export interface WorkerEventMessage {
  type: 'event'
  data: RealtimeEvent
}

// No frame arrived within the confirmation window after the socket opened.
export interface WorkerUnconfirmedMessage {
  type: 'unconfirmed'
}

export type WorkerMessage = WorkerStatusMessage | WorkerEventMessage | WorkerUnconfirmedMessage

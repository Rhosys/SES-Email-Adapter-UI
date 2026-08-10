import type { Label } from '@/types/server'

export const mockLabels: Label[] = [
  { label: 'lbl_1', name: 'Receipts', color: '#a6e3a1', icon: '🧾', applyInstruction: 'Apply to purchase receipts and payment confirmations', createdAt: '2026-01-01T00:00:00Z' },
  { label: 'lbl_2', name: 'Newsletters', color: '#89b4fa', icon: '📰', applyInstruction: 'Apply to recurring editorial digests and curated content emails', createdAt: '2026-01-01T00:00:00Z' },
  { label: 'lbl_3', name: 'Finance', color: '#f9e2af', icon: '💰', applyInstruction: 'Apply to bank statements, investment updates, and financial notifications', createdAt: '2026-02-01T00:00:00Z' },
  { label: 'lbl_4', name: 'Travel', color: '#94e2d5', icon: '✈️', applyInstruction: 'Apply to flight bookings, hotel reservations, and travel itineraries', createdAt: '2026-02-01T00:00:00Z' },
  { label: 'lbl_5', name: 'Important', color: '#f38ba8', icon: '⭐', applyInstruction: 'Apply to emails requiring immediate attention or a time-sensitive response', createdAt: '2026-03-01T00:00:00Z' },
  { label: 'lbl_6', name: 'Work', color: '#cba6f7', icon: '💼', applyInstruction: 'Apply to emails related to professional work, colleagues, or business operations', createdAt: '2026-03-01T00:00:00Z' },
  { label: 'lbl_7', name: 'Shopping', color: '#fab387', icon: '🛍️', applyInstruction: 'Apply to order confirmations, shipping notifications, and retail promotions', createdAt: '2026-04-01T00:00:00Z' },
  { label: 'lbl_8', name: 'Health', color: '#f5c2e7', icon: '🏥', applyInstruction: 'Apply to medical appointments, test results, and healthcare notifications', createdAt: '2026-04-01T00:00:00Z' },
]

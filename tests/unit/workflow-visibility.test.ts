import { describe, it, expect } from 'vitest'
import { isWorkflowEntryVisible } from '@/lib/workflow-visibility'
import type { WorkflowData } from '@/types/server'

describe('isWorkflowEntryVisible', () => {
  describe('events', () => {
    it('hides an entry whose eventType is "cancellation"', () => {
      const entry = { eventType: 'cancellation', eventName: 'AWS Community Day' } as WorkflowData
      expect(isWorkflowEntryVisible('events', entry)).toBe(false)
    })

    it('shows an entry for any other eventType', () => {
      const entry = { eventType: 'update', eventName: 'AWS Community Day' } as WorkflowData
      expect(isWorkflowEntryVisible('events', entry)).toBe(true)
    })
  })
})

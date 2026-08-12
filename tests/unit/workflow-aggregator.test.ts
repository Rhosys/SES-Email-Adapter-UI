import { describe, it, expect } from 'vitest'
import { aggregateWorkflowPanels } from '@/lib/workflow-aggregator'
import type { SignalGroup } from '@/lib/dedup'
import type { Signal, Workflow, WorkflowData, EmailInboundSignal, PackageData } from '@/types/server'

let counter = 0
// workflow is passed explicitly because WorkflowData carries no discriminant of
// its own on the wire — the signal envelope's `data.workflow` is authoritative.
function makeSignalGroup(workflow: Workflow, workflowData?: WorkflowData, overrides?: Partial<EmailInboundSignal>): SignalGroup {
  counter++
  const signal: EmailInboundSignal = {
    signalId: overrides?.signalId ?? `sig-${counter}`,
    threadId: overrides?.threadId ?? 'thread-1',
    type: 'email',
    source: 'system',
    status: overrides?.status ?? 'active',
    createdAt: overrides?.createdAt ?? `2024-01-${String(counter).padStart(2, '0')}T00:00:00Z`,
    data: {
      receivedAt: `2024-01-${String(counter).padStart(2, '0')}T00:00:00Z`,
      summary: 'test signal',
      from: { address: 'sender@example.com' },
      to: [{ address: 'user@example.com' }],
      cc: [],
      subject: 'Test',
      attachments: [],
      headers: {},
      recipientAddress: 'user@example.com',
      workflow,
      workflowData,
      spamScore: 0,
    },
  }
  return { signal, duplicates: [] }
}

describe('aggregateWorkflowPanels', () => {
  describe('limits to 10 qualifying signals', () => {
    it('uses only the first 10 signals with workflowData', () => {
      const groups: SignalGroup[] = Array.from({ length: 12 }, (_, i) =>
        makeSignalGroup('package', {
          packageType: 'shipping',
          retailer: `retailer-${i}`,
        } as PackageData)
      )

      const result = aggregateWorkflowPanels(groups)
      // All 12 are different retailers so none are merge-compatible → 10 entries
      expect(result).toHaveLength(1)
      expect(result[0].entries).toHaveLength(10)
      // Retailer 10 and 11 (0-indexed) should NOT be present
      const retailers = result[0].entries.map((e) => (e as PackageData).retailer)
      expect(retailers).not.toContain('retailer-10')
      expect(retailers).not.toContain('retailer-11')
    })
  })

  describe('groups by workflow type', () => {
    it('produces one group per distinct workflow type', () => {
      const groups: SignalGroup[] = [
        makeSignalGroup('package', { packageType: 'shipping', retailer: 'Amazon' } as PackageData),
        makeSignalGroup('auth', { authType: 'verification', service: 'GitHub' }),
        makeSignalGroup('package', { packageType: 'delivered', retailer: 'eBay' } as PackageData),
      ]

      const result = aggregateWorkflowPanels(groups)
      expect(result).toHaveLength(2)
      const workflows = result.map((g) => g.workflow)
      expect(workflows).toContain('package')
      expect(workflows).toContain('auth')
    })

    it('groups entries with same workflow into same group', () => {
      const groups: SignalGroup[] = [
        makeSignalGroup('package', { packageType: 'shipping', retailer: 'Amazon' } as PackageData),
        makeSignalGroup('package', { packageType: 'delivered', retailer: 'eBay' } as PackageData),
      ]

      const result = aggregateWorkflowPanels(groups)
      expect(result).toHaveLength(1)
      expect(result[0].workflow).toBe('package')
      expect(result[0].entries).toHaveLength(2)
    })
  })

  describe('deduplicates identical entries (content-equality)', () => {
    it('removes exact duplicates keeping only one', () => {
      const data: PackageData = { packageType: 'shipping', retailer: 'Amazon', orderNumber: '123' }
      const groups: SignalGroup[] = [
        makeSignalGroup('package', { ...data }),
        makeSignalGroup('package', { ...data }),
        makeSignalGroup('package', { ...data }),
      ]

      const result = aggregateWorkflowPanels(groups)
      expect(result).toHaveLength(1)
      expect(result[0].entries).toHaveLength(1)
    })

    it('treats entries differing only in null/undefined fields as identical', () => {
      const a: PackageData = { packageType: 'shipping', retailer: 'Amazon', trackingNumber: undefined }
      const b: PackageData = { packageType: 'shipping', retailer: 'Amazon' }
      const groups: SignalGroup[] = [makeSignalGroup('package', a), makeSignalGroup('package', b)]

      const result = aggregateWorkflowPanels(groups)
      expect(result).toHaveLength(1)
      // Both canonicalize identically (undefined fields are stripped)
      expect(result[0].entries).toHaveLength(1)
    })
  })

  describe('merges merge-compatible entries (null-fill, newest wins)', () => {
    it('merges two entries where one has a field the other lacks', () => {
      const older: PackageData = { packageType: 'shipping', retailer: 'Amazon', trackingNumber: '123' }
      const newer: PackageData = { packageType: 'shipping', retailer: 'Amazon' }
      // newer is index 0 (most recent), older is index 1
      const groups: SignalGroup[] = [makeSignalGroup('package', newer), makeSignalGroup('package', older)]

      const result = aggregateWorkflowPanels(groups)
      expect(result).toHaveLength(1)
      expect(result[0].entries).toHaveLength(1)
      // Merged result should have trackingNumber from older (null-fill)
      expect((result[0].entries[0] as PackageData).trackingNumber).toBe('123')
    })

    it('newest value wins when both define the same field identically', () => {
      const older: PackageData = { packageType: 'shipping', retailer: 'Amazon', estimatedDelivery: 'Jan 5' }
      const newer: PackageData = { packageType: 'shipping', retailer: 'Amazon', estimatedDelivery: 'Jan 5', trackingNumber: 'XYZ' }
      const groups: SignalGroup[] = [makeSignalGroup('package', newer), makeSignalGroup('package', older)]

      const result = aggregateWorkflowPanels(groups)
      expect(result).toHaveLength(1)
      expect(result[0].entries).toHaveLength(1)
      const merged = result[0].entries[0] as PackageData
      expect(merged.trackingNumber).toBe('XYZ')
      expect(merged.estimatedDelivery).toBe('Jan 5')
    })
  })

  describe('retains non-merge-compatible entries as separate items', () => {
    it('keeps entries with conflicting defined values separate', () => {
      const a: PackageData = { packageType: 'shipping', retailer: 'Amazon', trackingNumber: '111' }
      const b: PackageData = { packageType: 'shipping', retailer: 'Amazon', trackingNumber: '222' }
      const groups: SignalGroup[] = [makeSignalGroup('package', a), makeSignalGroup('package', b)]

      const result = aggregateWorkflowPanels(groups)
      expect(result).toHaveLength(1)
      expect(result[0].entries).toHaveLength(2)
    })

    it('keeps entries with different retailers separate', () => {
      const a: PackageData = { packageType: 'shipping', retailer: 'Amazon' }
      const b: PackageData = { packageType: 'shipping', retailer: 'eBay' }
      const groups: SignalGroup[] = [makeSignalGroup('package', a), makeSignalGroup('package', b)]

      const result = aggregateWorkflowPanels(groups)
      expect(result).toHaveLength(1)
      expect(result[0].entries).toHaveLength(2)
    })
  })

  describe('orders groups by newest contributing signal', () => {
    it('group with newest signal appears first', () => {
      // Index 0 is newest. auth at index 0, package at index 1
      const groups: SignalGroup[] = [
        makeSignalGroup('auth', { authType: 'verification', service: 'GitHub' }),
        makeSignalGroup('package', { packageType: 'shipping', retailer: 'Amazon' } as PackageData),
      ]

      const result = aggregateWorkflowPanels(groups)
      expect(result[0].workflow).toBe('auth')
      expect(result[1].workflow).toBe('package')
    })

    it('when a workflow type appears at multiple positions, uses the newest', () => {
      // package at 0, auth at 1, package at 2
      const groups: SignalGroup[] = [
        makeSignalGroup('package', { packageType: 'shipping', retailer: 'Amazon' } as PackageData),
        makeSignalGroup('auth', { authType: 'verification', service: 'GitHub' }),
        makeSignalGroup('package', { packageType: 'delivered', retailer: 'eBay' } as PackageData),
      ]

      const result = aggregateWorkflowPanels(groups)
      // package has newest at index 0, auth at index 1
      expect(result[0].workflow).toBe('package')
      expect(result[1].workflow).toBe('auth')
    })

    it('tie-breaks alphabetically by workflow type', () => {
      // travel at 0, package at 1, travel at 2, package at 3
      // travel newest = 0, package newest = 1 → travel first
      const groups: SignalGroup[] = [
        makeSignalGroup('travel', { travelType: 'flight', provider: 'Swiss' }),
        makeSignalGroup('package', { packageType: 'shipping', retailer: 'Amazon' } as PackageData),
        makeSignalGroup('travel', { travelType: 'hotel', provider: 'Hilton' }),
        makeSignalGroup('package', { packageType: 'delivered', retailer: 'eBay' } as PackageData),
      ]

      const result = aggregateWorkflowPanels(groups)
      expect(result[0].workflow).toBe('travel')
      expect(result[1].workflow).toBe('package')
    })
  })

  describe('edge cases', () => {
    it('returns empty array for zero signals', () => {
      expect(aggregateWorkflowPanels([])).toEqual([])
    })

    it('skips signals without workflowData', () => {
      const groups: SignalGroup[] = [
        makeSignalGroup('package', undefined),
        makeSignalGroup('auth', undefined),
      ]

      expect(aggregateWorkflowPanels(groups)).toEqual([])
    })

    it('all duplicates produce a single entry', () => {
      const data: PackageData = { packageType: 'shipping', retailer: 'Amazon' }
      const groups: SignalGroup[] = Array.from({ length: 5 }, () => makeSignalGroup('package', { ...data }))

      const result = aggregateWorkflowPanels(groups)
      expect(result).toHaveLength(1)
      expect(result[0].entries).toHaveLength(1)
    })

    it('mixed workflow types produce multiple groups', () => {
      const groups: SignalGroup[] = [
        makeSignalGroup('auth', { authType: 'verification', service: 'GitHub' }),
        makeSignalGroup('package', { packageType: 'shipping', retailer: 'Amazon' } as PackageData),
        makeSignalGroup('travel', { travelType: 'flight', provider: 'Swiss' }),
      ]

      const result = aggregateWorkflowPanels(groups)
      expect(result).toHaveLength(3)
    })

    it('skips entries with empty workflow string', () => {
      const signal = makeSignalGroup('package', { packageType: 'shipping', retailer: 'Amazon' } as PackageData)
      // Manually set workflow to empty string on signal data
      const emptyWorkflow = makeSignalGroup('' as never, { packageType: 'shipping', retailer: 'nobody' } as PackageData)

      const groups: SignalGroup[] = [signal, emptyWorkflow]
      const result = aggregateWorkflowPanels(groups)
      expect(result).toHaveLength(1)
      expect(result[0].workflow).toBe('package')
    })

    it('skips non-inbound email signals', () => {
      const outboundSignal: Signal = {
        signalId: 'outbound-1',
        threadId: 'thread-1',
        type: 'email',
        source: 'user',
        status: 'sent',
        createdAt: '2024-01-01T00:00:00Z',
        data: {
          from: { address: 'user@example.com' },
          to: [{ address: 'other@example.com' }],
          cc: [],
          bcc: [],
          subject: 'Hello',
          attachments: [],
          sendInitiatedAt: '2024-01-01T00:00:00Z',
        },
      }
      const groups: SignalGroup[] = [
        { signal: outboundSignal, duplicates: [] },
        makeSignalGroup('package', { packageType: 'shipping', retailer: 'Amazon' } as PackageData),
      ]

      const result = aggregateWorkflowPanels(groups)
      expect(result).toHaveLength(1)
      expect(result[0].workflow).toBe('package')
    })
  })
})

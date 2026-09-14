import { describe, it, expect } from 'vitest'
import { workflowMatchesResource } from '@/lib/resource-match'
import type { Resource, EventsData, PackageData } from '@/types/server'

function makeResource(overrides: Partial<Resource> = {}): Resource {
  return {
    resourceId: 'res_1',
    threadId: 'thread_1',
    workflow: 'events',
    status: 'active',
    expectedResolutionDate: '2026-08-20T00:00:00Z',
    title: 'AWS Community Day 2026 - Switzerland',
    assets: [],
    createdAt: '2026-08-01T00:00:00Z',
    updatedAt: '2026-08-01T00:00:00Z',
    ...overrides,
  }
}

describe('workflowMatchesResource', () => {
  it('hides an entry whose eventName is contained by the resource title', () => {
    const entry: EventsData = { eventType: 'reminder', eventName: 'AWS Community Day' }
    expect(workflowMatchesResource('events', entry, [makeResource()])).toBe(true)
  })

  it('matches case-invariantly', () => {
    const entry: EventsData = { eventType: 'reminder', eventName: 'aws community day' }
    expect(workflowMatchesResource('events', entry, [makeResource()])).toBe(true)
  })

  it('does not match an unrelated event name', () => {
    const entry: EventsData = { eventType: 'update', eventName: 'Google Cloud Next' }
    expect(workflowMatchesResource('events', entry, [makeResource()])).toBe(false)
  })

  it('never matches across workflow types', () => {
    const entry: PackageData = { packageType: 'shipping', retailer: 'X' }
    expect(workflowMatchesResource('package', entry, [makeResource()])).toBe(false)
  })

  it('returns false when the entry has no eventName', () => {
    const entry = { eventType: 'update' } as unknown as EventsData
    expect(workflowMatchesResource('events', entry, [makeResource()])).toBe(false)
  })

  it('returns false when the resource has no title', () => {
    const entry: EventsData = { eventType: 'update', eventName: 'AWS Community Day' }
    expect(workflowMatchesResource('events', entry, [makeResource({ title: undefined })])).toBe(false)
  })

  describe('date narrowing', () => {
    it('matches when both dates fall on the same day', () => {
      const entry: EventsData = { eventType: 'update', eventName: 'AWS Community Day', eventStartDatetime: '2026-08-20T09:00:00+02:00' }
      const resource = makeResource({ displayDate: '2026-08-20T18:00:00Z' })
      expect(workflowMatchesResource('events', entry, [resource])).toBe(true)
    })

    it('does not match when both dates fall on different days', () => {
      const entry: EventsData = { eventType: 'update', eventName: 'AWS Community Day', eventStartDatetime: '2026-08-21T09:00:00Z' }
      const resource = makeResource({ displayDate: '2026-08-20T09:00:00Z' })
      expect(workflowMatchesResource('events', entry, [resource])).toBe(false)
    })

    it('matches on name alone when the entry has no date', () => {
      const entry: EventsData = { eventType: 'update', eventName: 'AWS Community Day' }
      const resource = makeResource({ displayDate: '2026-08-20T09:00:00Z' })
      expect(workflowMatchesResource('events', entry, [resource])).toBe(true)
    })

    it('matches on name alone when the resource has no date', () => {
      const entry: EventsData = { eventType: 'update', eventName: 'AWS Community Day', eventStartDatetime: '2026-08-20T09:00:00Z' }
      const resource = makeResource({ displayDate: undefined })
      expect(workflowMatchesResource('events', entry, [resource])).toBe(true)
    })
  })
})

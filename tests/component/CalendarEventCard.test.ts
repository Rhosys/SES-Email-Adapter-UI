import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import CalendarEventCard from '@/components/CalendarEventCard.vue'
import { useAccountStore } from '@/stores/account'
import type { CalendarEventSignal } from '@/types/server'

vi.mock('@/lib/api', () => ({
  api: {
    rsvpSignal: vi.fn(),
  },
}))

function makeSignal(overrides: Partial<CalendarEventSignal['data']> = {}): CalendarEventSignal {
  return {
    signalId: 'sig_cal_1',
    threadId: 'thread_1',
    source: 'system',
    status: 'active',
    type: 'calendar_event',
    createdAt: '2025-06-01T10:00:00Z',
    data: {
      title: 'Team Standup',
      startTime: '2025-06-02T09:00:00Z',
      endTime: '2025-06-02T09:30:00Z',
      organizer: 'boss@company.com',
      attendees: [],
      linkedSignalId: 'sig_email_1',
      ...overrides,
    },
  }
}

describe('CalendarEventCard — external link', () => {
  beforeEach(() => {
    const pinia = createPinia()
    setActivePinia(pinia)
    useAccountStore().account = {
      accountId: 'acc_1',
      name: 'Test',
      filtering: { defaultUnknownSenderPolicy: 'quarantine_visible' },
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    }
  })

  it('renders link with correct href and rel when data.url is set', () => {
    const wrapper = mount(CalendarEventCard, {
      props: { signal: makeSignal({ url: 'https://calendar.google.com/event/abc' }) },
    })
    const link = wrapper.find('a[target="_blank"]')
    expect(link.exists()).toBe(true)
    expect(link.attributes('href')).toBe('https://calendar.google.com/event/abc')
    expect(link.attributes('rel')).toBe('noopener noreferrer')
    expect(link.text()).toContain('View in calendar')
  })

  it('does not render link when data.url is absent', () => {
    const wrapper = mount(CalendarEventCard, {
      props: { signal: makeSignal() },
    })
    const link = wrapper.find('a[target="_blank"]')
    expect(link.exists()).toBe(false)
  })

  it('does not render link when data.url is empty string', () => {
    const wrapper = mount(CalendarEventCard, {
      props: { signal: makeSignal({ url: '' }) },
    })
    const link = wrapper.find('a[target="_blank"]')
    expect(link.exists()).toBe(false)
  })
})

describe('CalendarEventCard — RSVP buttons', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    useAccountStore().account = {
      accountId: 'acc_1', name: 'Test', filtering: { defaultUnknownSenderPolicy: 'quarantine_visible' },
      createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z',
    }
  })

  it('renders Accept/Tentative/Decline as button elements for an active event', () => {
    const wrapper = mount(CalendarEventCard, { props: { signal: makeSignal() } })
    const buttons = wrapper.findAll('button')
    expect(buttons).toHaveLength(3)
    expect(buttons.map(b => b.text())).toEqual(['Accept', 'Tentative', 'Decline'])
    // Buttonized: rounded + padding, not bare text
    expect(buttons[0]!.classes()).toEqual(expect.arrayContaining(['rounded-md', 'px-3', 'py-1.5']))
  })
})

describe('CalendarEventCard — cancellation', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    useAccountStore().account = {
      accountId: 'acc_1', name: 'Test', filtering: { defaultUnknownSenderPolicy: 'quarantine_visible' },
      createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z',
    }
  })

  it('shows a Cancelled badge and a cancellation notice, and hides the RSVP buttons', () => {
    const wrapper = mount(CalendarEventCard, {
      props: { signal: makeSignal({ cancelledAt: '2025-06-01T12:00:00Z', location: 'Room A' }) },
    })
    expect(wrapper.text()).toContain('Cancelled')
    expect(wrapper.text()).toContain('cancelled by the organizer')
    // No RSVP is possible on a cancelled event.
    expect(wrapper.findAll('button')).toHaveLength(0)
  })

  it('retains and strikes through the event fields rather than blanking them', () => {
    const wrapper = mount(CalendarEventCard, {
      props: { signal: makeSignal({ cancelledAt: '2025-06-01T12:00:00Z', location: 'Room A' }) },
    })
    // Title and location text remain present (struck through via class, not removed).
    expect(wrapper.text()).toContain('Team Standup')
    expect(wrapper.text()).toContain('Room A')
    expect(wrapper.find('.line-through').exists()).toBe(true)
  })
})

describe('CalendarEventCard — update (previousValues)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    useAccountStore().account = {
      accountId: 'acc_1', name: 'Test', filtering: { defaultUnknownSenderPolicy: 'quarantine_visible' },
      createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z',
    }
  })

  it('shows a previous->current arrow for a changed start time and an updated notice', () => {
    const wrapper = mount(CalendarEventCard, {
      props: {
        signal: makeSignal({
          startTime: '2025-06-02T14:00:00Z',
          previousValues: { changedAt: '2025-06-01T11:00:00Z', startTime: '2025-06-02T09:00:00Z' },
        }),
      },
    })
    expect(wrapper.text()).toContain('→')
    expect(wrapper.text()).toContain('This event was updated')
    // The RSVP buttons are still available on an update.
    expect(wrapper.findAll('button')).toHaveLength(3)
  })

  it('shows a previous->current arrow for a changed location', () => {
    const wrapper = mount(CalendarEventCard, {
      props: {
        signal: makeSignal({
          location: 'Room B',
          previousValues: { changedAt: '2025-06-01T11:00:00Z', location: 'Room A' },
        }),
      },
    })
    const whereLine = wrapper.text()
    expect(whereLine).toContain('Room A')
    expect(whereLine).toContain('Room B')
    expect(whereLine).toContain('→')
  })
})

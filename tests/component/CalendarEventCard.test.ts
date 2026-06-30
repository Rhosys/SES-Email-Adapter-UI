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
    arcId: 'arc_1',
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

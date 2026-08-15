import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { DateTime } from 'luxon'
import InlineCalendar from '@/components/InlineCalendar.vue'

describe('InlineCalendar', () => {
  it('disables every day before minDate', async () => {
    const minDate = DateTime.local().plus({ days: 1 }).toISODate()!
    const wrapper = mount(InlineCalendar, { props: { modelValue: null, minDate } })

    const disabledDays = wrapper.findAll('.grid button[disabled]')
    // Today (and any earlier days shown in the current month) should be disabled.
    const todayCell = wrapper.findAll('.grid button').find((b) => b.text() === String(DateTime.local().day))
    expect(todayCell?.attributes('disabled')).toBeDefined()
    expect(disabledDays.length).toBeGreaterThan(0)
  })

  it('emits update:modelValue with the clicked day’s ISO date', async () => {
    const minDate = DateTime.local().plus({ days: 1 }).toISODate()!
    const wrapper = mount(InlineCalendar, { props: { modelValue: null, minDate } })

    const enabledDays = wrapper.findAll('.grid button').filter((b) => b.attributes('disabled') === undefined)
    await enabledDays[0]!.trigger('click')

    expect(wrapper.emitted('update:modelValue')).toHaveLength(1)
    const emittedIso = wrapper.emitted('update:modelValue')![0]![0] as string
    expect(emittedIso).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('does not emit when a disabled day is clicked', async () => {
    const minDate = DateTime.local().plus({ days: 1 }).toISODate()!
    const wrapper = mount(InlineCalendar, { props: { modelValue: null, minDate } })

    const disabledDay = wrapper.findAll('.grid button[disabled]').at(0)
    expect(disabledDay).toBeTruthy()
    await disabledDay!.trigger('click')

    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })

  it('navigating to the previous month is blocked once the view reaches minDate’s month', async () => {
    const minDate = DateTime.local().plus({ days: 1 }).toISODate()!
    const wrapper = mount(InlineCalendar, { props: { modelValue: null, minDate } })

    const prevButton = wrapper.find('button[aria-label="Previous month"]')
    expect(prevButton.attributes('disabled')).toBeDefined()
  })

  it('marks the selected date matching modelValue', () => {
    const minDate = DateTime.local().plus({ days: 1 }).toISODate()!
    const selected = DateTime.local().plus({ days: 3 }).toISODate()!
    const wrapper = mount(InlineCalendar, { props: { modelValue: selected, minDate } })

    const selectedDay = wrapper.findAll('.grid button').find((b) => b.attributes('aria-pressed') === 'true')
    expect(selectedDay).toBeTruthy()
    expect(selectedDay!.text()).toBe(String(DateTime.fromISO(selected).day))
  })
})

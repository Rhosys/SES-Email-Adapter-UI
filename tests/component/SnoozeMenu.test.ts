import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { DateTime } from 'luxon'
import SnoozeMenu from '@/components/SnoozeMenu.vue'

function mockMatchMedia(initialMatches: boolean) {
  const listeners = new Set<(e: { matches: boolean }) => void>()
  let matches = initialMatches
  const mql = {
    get matches() {
      return matches
    },
    addEventListener: (_: string, cb: (e: { matches: boolean }) => void) => listeners.add(cb),
    removeEventListener: (_: string, cb: (e: { matches: boolean }) => void) => listeners.delete(cb),
  }
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(mql))
}

describe('SnoozeMenu — desktop popover', () => {
  beforeEach(() => {
    mockMatchMedia(true) // min-width: 640px matches → desktop
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('emits a preset snooze time and closes without opening the calendar', async () => {
    const wrapper = mount(SnoozeMenu, { attachTo: document.body })
    await wrapper.find('button[title="Snooze"]').trigger('click')

    const laterToday = wrapper.findAll('button').find((b) => b.text().includes('Later today'))!
    await laterToday.trigger('click')

    expect(wrapper.emitted('snooze')).toHaveLength(1)
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('picking a calendar day enables the confirm button, and confirming emits 9am on that day', async () => {
    const wrapper = mount(SnoozeMenu, { attachTo: document.body })
    await wrapper.find('button[title="Snooze"]').trigger('click')

    const confirmBefore = wrapper.find('[role="dialog"]').findAll('button').find((b) => b.text() === 'Snooze')!
    expect(confirmBefore.attributes('disabled')).toBeDefined()

    // Pick the first enabled (non-disabled) calendar day.
    const days = wrapper.findAll('[role="dialog"] .grid button').filter((b) => b.attributes('disabled') === undefined)
    expect(days.length).toBeGreaterThan(0)
    await days[0]!.trigger('click')
    await flushPromises()

    const confirmAfter = wrapper.findAll('button').find((b) => b.text().startsWith('Snooze until'))!
    expect(confirmAfter.attributes('disabled')).toBeUndefined()
    await confirmAfter.trigger('click')

    expect(wrapper.emitted('snooze')).toHaveLength(1)
    const isoTime = wrapper.emitted('snooze')![0]![0] as string
    const dt = DateTime.fromISO(isoTime)
    expect(dt.hour).toBe(9)
    expect(dt.minute).toBe(0)
    // The backend's followupAt schema (z.iso.datetime()) only accepts UTC
    // timestamps with a literal 'Z' suffix, not a numeric offset — regression
    // test for a bug where every snooze silently failed server-side.
    expect(isoTime).toMatch(/Z$/)
    wrapper.unmount()
  })

  it.each(['Later today', 'Tomorrow morning', 'Next week'])(
    'emits a UTC (Z-suffixed) timestamp for the "%s" preset, not a local-offset one',
    async (presetLabel) => {
      const wrapper = mount(SnoozeMenu, { attachTo: document.body })
      await wrapper.find('button[title="Snooze"]').trigger('click')

      const preset = wrapper.findAll('button').find((b) => b.text().includes(presetLabel))!
      await preset.trigger('click')

      const isoTime = wrapper.emitted('snooze')![0]![0] as string
      expect(isoTime).toMatch(/Z$/)
      wrapper.unmount()
    },
  )

  it('closes without emitting when Cancel is clicked', async () => {
    const wrapper = mount(SnoozeMenu, { attachTo: document.body })
    await wrapper.find('button[title="Snooze"]').trigger('click')

    const cancel = wrapper.findAll('button').find((b) => b.text() === 'Cancel')!
    await cancel.trigger('click')

    expect(wrapper.emitted('snooze')).toBeUndefined()
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    wrapper.unmount()
  })
})

describe('SnoozeMenu — mobile full-screen sheet', () => {
  beforeEach(() => {
    mockMatchMedia(false) // min-width: 640px doesn't match → mobile
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('opens a full-screen sheet (not the desktop popover) and the calendar is interactive', async () => {
    const wrapper = mount(SnoozeMenu, { attachTo: document.body })
    await wrapper.find('button[title="Snooze"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    // Teleported to document.body — assert against the document, not the wrapper.
    const sheet = document.querySelector('.fixed.inset-0.z-\\[200\\]')
    expect(sheet).toBeTruthy()
    expect(sheet!.textContent).toContain('Snooze until…')

    const days = Array.from(sheet!.querySelectorAll('.grid button')).filter(
      (b) => !(b as HTMLButtonElement).disabled,
    )
    expect(days.length).toBeGreaterThan(0)
    ;(days[0] as HTMLButtonElement).click()
    await flushPromises()

    const confirmButton = Array.from(sheet!.querySelectorAll('button')).find((b) =>
      b.textContent?.startsWith('Snooze until'),
    ) as HTMLButtonElement
    expect(confirmButton.disabled).toBe(false)
    confirmButton.click()

    expect(wrapper.emitted('snooze')).toHaveLength(1)
    wrapper.unmount()
  })

  it('closing via the × button does not emit', async () => {
    const wrapper = mount(SnoozeMenu, { attachTo: document.body })
    await wrapper.find('button[title="Snooze"]').trigger('click')
    await flushPromises()

    const sheet = document.querySelector('.fixed.inset-0.z-\\[200\\]')!
    const closeBtn = sheet.querySelector('button[aria-label="Close"]') as HTMLButtonElement
    closeBtn.click()
    await flushPromises()

    expect(wrapper.emitted('snooze')).toBeUndefined()
    wrapper.unmount()
  })
})

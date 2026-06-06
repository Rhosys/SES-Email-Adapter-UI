import { describe, it, expect, beforeEach } from 'vitest'
import { ref } from 'vue'
import { mount, RouterLinkStub } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ArcRow from '@/components/ArcRow.vue'
import { NOW_KEY } from '@/composables/useRelativeTime'
import type { Arc } from '@/types/server'

const nowProvide = { [NOW_KEY as symbol]: ref(Date.now()) }

const baseArc: Arc = {
  arcId: 'arc_1',
  workflow: 'conversation',
  labels: ['urgent'],
  status: 'active',
  summary: 'Hello from the team',
  lastSignalAt: new Date().toISOString(),
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  urgency: 'high',
}

function mountArc(arc: Arc, selected = false) {
  return mount(ArcRow, {
    props: { arc, selected },
    global: {
      provide: nowProvide,
      stubs: { RouterLink: RouterLinkStub },
    },
  })
}

describe('ArcRow', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('renders summary text', () => {
    const wrapper = mountArc(baseArc)
    expect(wrapper.text()).toContain('Hello from the team')
  })

  it('shows label chips for each label', () => {
    const wrapper = mountArc(baseArc)
    expect(wrapper.text()).toContain('urgent')
  })

  it('does not apply font-semibold (unread tracking not in wire shape)', () => {
    const wrapper = mountArc(baseArc)
    expect(wrapper.html()).not.toContain('font-semibold')
  })

  it('does not apply font-semibold when arc has read marker', () => {
    const readArc = { ...baseArc, lastUserConfirmedAt: '2025-01-01T12:00:00Z' }
    const wrapper = mountArc(readArc as Arc)
    expect(wrapper.html()).not.toContain('font-semibold')
  })

  it('emits toggle-select with arc id on checkbox change', async () => {
    const wrapper = mountArc(baseArc)
    await wrapper.find('input[type="checkbox"]').trigger('change')
    expect(wrapper.emitted('toggle-select')?.[0]).toEqual(['arc_1'])
  })

  it('renders checkbox as checked when selected', () => {
    const wrapper = mountArc(baseArc, true)
    const checkbox = wrapper.find('input[type="checkbox"]').element as HTMLInputElement
    expect(checkbox.checked).toBe(true)
  })

  it('renders multiple labels', () => {
    const arc = { ...baseArc, labels: ['label-a', 'label-b'] }
    const wrapper = mountArc(arc)
    expect(wrapper.text()).toContain('label-a')
    expect(wrapper.text()).toContain('label-b')
  })
})

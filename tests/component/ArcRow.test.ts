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

  it('shows label dots for each label', () => {
    const wrapper = mountArc(baseArc)
    const dots = wrapper.findAll('.rounded-full.bg-ctp-mauve')
    expect(dots.length).toBe(1)
  })

  it('applies font-semibold to sender', () => {
    const wrapper = mountArc(baseArc)
    expect(wrapper.html()).toContain('font-semibold')
  })

  it('applies font-semibold regardless of read marker', () => {
    const readArc = { ...baseArc, lastUserConfirmedAt: '2025-01-01T12:00:00Z' }
    const wrapper = mountArc(readArc as Arc)
    expect(wrapper.html()).toContain('font-semibold')
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

  it('renders multiple label dots', () => {
    const arc = { ...baseArc, labels: ['label-a', 'label-b'] }
    const wrapper = mountArc(arc)
    const dots = wrapper.findAll('.rounded-full.bg-ctp-mauve')
    expect(dots.length).toBe(2)
  })
})

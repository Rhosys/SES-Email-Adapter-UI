import { describe, it, expect, beforeEach } from 'vitest'
import { ref } from 'vue'
import { mount, RouterLinkStub } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ActiveArcRow from '@/components/ActiveArcRow.vue'
import AllArcRow from '@/components/AllArcRow.vue'
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

function mountActive(arc: Arc, selected = false) {
  return mount(ActiveArcRow, {
    props: { arc, selected },
    global: {
      provide: nowProvide,
      stubs: { RouterLink: RouterLinkStub },
    },
  })
}

function mountAll(arc: Arc, selected = false) {
  return mount(AllArcRow, {
    props: { arc, selected },
    global: {
      provide: nowProvide,
      stubs: { RouterLink: RouterLinkStub },
    },
  })
}

describe('ActiveArcRow', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('renders summary text', () => {
    const wrapper = mountActive(baseArc)
    expect(wrapper.text()).toContain('Hello from the team')
  })

  it('shows label dots for each label', () => {
    const wrapper = mountActive(baseArc)
    const dots = wrapper.findAll('.rounded-full.bg-ctp-mauve')
    expect(dots.length).toBe(1)
  })

  it('applies font-semibold to sender', () => {
    const wrapper = mountActive(baseArc)
    expect(wrapper.html()).toContain('font-semibold')
  })

  it('emits toggle-select with arc id on checkbox change', async () => {
    const wrapper = mountActive(baseArc)
    await wrapper.find('input[type="checkbox"]').trigger('change')
    expect(wrapper.emitted('toggle-select')?.[0]).toEqual(['arc_1'])
  })

  it('renders checkbox as checked when selected', () => {
    const wrapper = mountActive(baseArc, true)
    const checkbox = wrapper.find('input[type="checkbox"]').element as HTMLInputElement
    expect(checkbox.checked).toBe(true)
  })

  it('renders multiple label dots', () => {
    const arc = { ...baseArc, labels: ['label-a', 'label-b'] }
    const wrapper = mountActive(arc)
    const dots = wrapper.findAll('.rounded-full.bg-ctp-mauve')
    expect(dots.length).toBe(2)
  })
})

describe('AllArcRow', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('shows status badge', () => {
    const wrapper = mountAll(baseArc)
    expect(wrapper.text()).toContain('Active')
  })

  it('shows Archived badge for archived arcs', () => {
    const arc = { ...baseArc, status: 'archived' as const }
    const wrapper = mountAll(arc)
    expect(wrapper.text()).toContain('Archived')
  })

  it('shows Deleted badge for deleted arcs', () => {
    const arc = { ...baseArc, status: 'deleted' as const }
    const wrapper = mountAll(arc)
    expect(wrapper.text()).toContain('Deleted')
  })
})

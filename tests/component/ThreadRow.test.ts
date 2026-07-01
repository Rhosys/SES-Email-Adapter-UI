import { describe, it, expect, beforeEach } from 'vitest'
import { ref } from 'vue'
import { mount, RouterLinkStub } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ActiveThreadRow from '@/components/ActiveThreadRow.vue'
import AllThreadRow from '@/components/AllThreadRow.vue'
import { NOW_KEY } from '@/composables/useRelativeTime'
import type { Thread } from '@/types/server'

const nowProvide = { [NOW_KEY as symbol]: ref(Date.now()) }

const baseThread: Thread = {
  threadId: 'thread_1',
  workflow: 'conversation',
  labels: ['urgent'],
  status: 'active',
  summary: 'Hello from the team',
  lastSignalAt: new Date().toISOString(),
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  urgency: 'high',
}

function mountActive(thread: Thread, selected = false) {
  return mount(ActiveThreadRow, {
    props: { thread, selected },
    global: {
      provide: nowProvide,
      stubs: { RouterLink: RouterLinkStub },
    },
  })
}

function mountAll(thread: Thread, selected = false) {
  return mount(AllThreadRow, {
    props: { thread, selected },
    global: {
      provide: nowProvide,
      stubs: { RouterLink: RouterLinkStub },
    },
  })
}

describe('ActiveThreadRow', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('renders summary text', () => {
    const wrapper = mountActive(baseThread)
    expect(wrapper.text()).toContain('Hello from the team')
  })

  it('shows label dots for each label', () => {
    const wrapper = mountActive(baseThread)
    const dots = wrapper.findAll('.h-2.w-2.rounded-full')
    expect(dots.length).toBe(1)
  })

  it('applies font-semibold to sender', () => {
    const wrapper = mountActive(baseThread)
    expect(wrapper.html()).toContain('font-semibold')
  })

  it('emits toggle-select with thread id on checkbox change', async () => {
    const wrapper = mountActive(baseThread)
    await wrapper.find('input[type="checkbox"]').trigger('change')
    expect(wrapper.emitted('toggle-select')?.[0]).toEqual(['thread_1'])
  })

  it('renders checkbox as checked when selected', () => {
    const wrapper = mountActive(baseThread, true)
    const checkbox = wrapper.find('input[type="checkbox"]').element as HTMLInputElement
    expect(checkbox.checked).toBe(true)
  })

  it('renders multiple label dots', () => {
    const thread = { ...baseThread, labels: ['label-a', 'label-b'] }
    const wrapper = mountActive(thread)
    const dots = wrapper.findAll('.h-2.w-2.rounded-full')
    expect(dots.length).toBe(2)
  })
})

describe('AllThreadRow', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('shows status badge', () => {
    const wrapper = mountAll(baseThread)
    expect(wrapper.text()).toContain('Active')
  })

  it('shows Archived badge for archived threads', () => {
    const thread = { ...baseThread, status: 'archived' as const }
    const wrapper = mountAll(thread)
    expect(wrapper.text()).toContain('Archived')
  })

  it('shows Deleted badge for deleted threads', () => {
    const thread = { ...baseThread, status: 'deleted' as const }
    const wrapper = mountAll(thread)
    expect(wrapper.text()).toContain('Deleted')
  })
})

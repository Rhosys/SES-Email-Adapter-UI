import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import WorkflowPanel from '@/components/WorkflowPanel.vue'
import type { Signal, AuthData, ConversationData, TestData } from '@/types/server'

function makeSignal(workflowData?: Signal['workflowData']): Signal {
  return {
    id: 'sig_1',
    arcId: 'arc_1',
    accountId: 'acc_1',
    status: 'received',
    source: 'ses',
    from: { address: 'sender@example.com', name: 'Sender' },
    to: [{ address: 'inbox@example.com' }],
    subject: 'Test',
    receivedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    workflowData,
  }
}

describe('WorkflowPanel', () => {
  it('renders nothing when workflowData is absent', () => {
    const wrapper = mount(WorkflowPanel, {
      props: { signal: makeSignal(undefined) },
    })
    expect(wrapper.html()).toBe('<!--v-if-->')
  })

  it('renders AuthPanel for auth workflow with service name', () => {
    const data: AuthData = {
      workflow: 'auth',
      authType: 'otp',
      code: '482931',
      service: 'GitHub',
      expiresInMinutes: 10,
    }
    const wrapper = mount(WorkflowPanel, {
      props: { signal: makeSignal(data) },
    })
    expect(wrapper.text()).toContain('GitHub')
    expect(wrapper.text()).toContain('482 931')
  })

  it('renders ConversationPanel for conversation workflow', () => {
    const data: ConversationData = {
      workflow: 'conversation',
      senderName: 'Alice',
      isReply: false,
      sentiment: 'neutral',
      requiresReply: true,
    }
    const wrapper = mount(WorkflowPanel, {
      props: { signal: makeSignal(data) },
    })
    expect(wrapper.text()).toContain('Alice')
    expect(wrapper.text()).toContain('Reply needed')
  })

  it('renders TestPanel for test workflow', () => {
    const data: TestData = { workflow: 'test', triggeredBy: 'user' }
    const wrapper = mount(WorkflowPanel, {
      props: { signal: makeSignal(data) },
    })
    expect(wrapper.text()).toContain('TEST')
    expect(wrapper.text()).toContain('Sent by you')
  })
})

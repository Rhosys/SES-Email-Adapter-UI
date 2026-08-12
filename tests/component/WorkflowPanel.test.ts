import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import WorkflowPanel from '@/components/WorkflowPanel.vue'
import type { Signal, Workflow, AuthData, ConversationData, TestData } from '@/types/server'

function makeSignal(workflow: Workflow, workflowData?: unknown): Signal {
  return {
    signalId: 'sig_1',
    threadId: 'thread_1',
    type: 'email',
    source: 'system',
    status: 'active',
    createdAt: new Date().toISOString(),
    data: {
      receivedAt: new Date().toISOString(),
      summary: 'Test',
      from: { address: 'sender@example.com', name: 'Sender' },
      to: [{ address: 'inbox@example.com' }],
      cc: [],
      subject: 'Test',
      attachments: [],
      headers: {},
      recipientAddress: 'inbox@example.com',
      workflow,
      spamScore: 0,
      workflowData,
    },
  } as Signal
}

describe('WorkflowPanel', () => {
  it('renders nothing when workflowData is absent', () => {
    const wrapper = mount(WorkflowPanel, {
      props: { signal: makeSignal('conversation', undefined) },
    })
    expect(wrapper.html()).toBe('<!--v-if-->')
  })

  it('renders AuthPanel for auth workflow with service name', () => {
    const data: AuthData = {
      authType: 'verification',
      code: '482931',
      service: 'GitHub',
      expiresInMinutes: '10',
    }
    const wrapper = mount(WorkflowPanel, {
      props: { signal: makeSignal('auth', data) },
    })
    expect(wrapper.text()).toContain('GitHub')
    expect(wrapper.text()).toContain('482 931')
  })

  it('renders ConversationPanel for conversation workflow', () => {
    const data: ConversationData = {
      sentiment: 'neutral',
      requiresReply: true,
    }
    const wrapper = mount(WorkflowPanel, {
      props: { signal: makeSignal('conversation', data) },
    })
    expect(wrapper.text()).toContain('Reply needed')
  })

  it('renders nothing for a conversation workflow with no reply needed', () => {
    const data: ConversationData = {
      sentiment: 'neutral',
      requiresReply: false,
    }
    const wrapper = mount(WorkflowPanel, {
      props: { signal: makeSignal('conversation', data) },
    })
    expect(wrapper.html()).toBe('<!--v-if-->')
  })

  it('renders TestPanel for test workflow', () => {
    const data: TestData = { triggeredBy: 'user' }
    const wrapper = mount(WorkflowPanel, {
      props: { signal: makeSignal('test', data) },
    })
    expect(wrapper.text()).toContain('TEST')
    expect(wrapper.text()).toContain('Sent by you')
  })
})

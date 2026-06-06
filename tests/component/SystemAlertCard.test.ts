import { describe, it, expect } from 'vitest'
import { mount, RouterLinkStub } from '@vue/test-utils'
import SystemAlertCard from '@/components/SystemAlertCard.vue'
import type { InvalidRuleFunctionSignal, InvalidTemplateFunctionSignal } from '@/types/server'

function mountCard(signal: InvalidRuleFunctionSignal | InvalidTemplateFunctionSignal) {
  return mount(SystemAlertCard, {
    props: { signal },
    global: {
      stubs: { RouterLink: RouterLinkStub },
    },
  })
}

describe('SystemAlertCard deep links', () => {
  it('renders RouterLink to /rules/<name> for invalid_rule_function', () => {
    const signal: InvalidRuleFunctionSignal = {
      signalId: 'sig_1',
      source: 'system',
      status: 'active',
      createdAt: '2025-01-15T10:00:00Z',
      type: 'invalid_rule_function',
      data: { resourceName: 'my-broken-rule', issue: 'TypeError: x is not a function' },
    }

    const wrapper = mountCard(signal)
    const link = wrapper.findComponent(RouterLinkStub)
    expect(link.exists()).toBe(true)
    expect(link.props('to')).toBe('/rules/my-broken-rule')
    expect(link.text()).toBe('my-broken-rule')
  })

  it('renders RouterLink to /templates for invalid_template_function', () => {
    const signal: InvalidTemplateFunctionSignal = {
      signalId: 'sig_2',
      source: 'system',
      status: 'active',
      createdAt: '2025-01-15T10:00:00Z',
      type: 'invalid_template_function',
      data: { resourceName: 'welcome-email', functionName: 'greet', issue: 'ReferenceError: name is not defined' },
    }

    const wrapper = mountCard(signal)
    const link = wrapper.findComponent(RouterLinkStub)
    expect(link.exists()).toBe(true)
    expect(link.props('to')).toBe('/templates')
    expect(link.text()).toBe('welcome-email')
  })
})

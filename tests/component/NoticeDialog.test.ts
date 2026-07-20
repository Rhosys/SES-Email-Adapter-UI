import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import NoticeDialog from '@/components/ui/NoticeDialog.vue'

function mountDialog(open = true, props: Record<string, unknown> = {}) {
  return mount(NoticeDialog, {
    props: { open, title: 'Not yet available', message: 'This feature is coming soon.', ...props },
    attachTo: document.body,
  })
}

describe('NoticeDialog', () => {
  it('does not render when closed', () => {
    const wrapper = mountDialog(false)
    expect(wrapper.find('[role="alertdialog"]').exists()).toBe(false)
  })

  it('renders role="alertdialog" reachable from an ancestor with no aria-hidden', () => {
    // Regression test: aria-hidden="true" on the backdrop used to hide this
    // entire subtree from the accessibility tree even though it's visibly on
    // screen, breaking getByRole('alertdialog')-style queries.
    const wrapper = mountDialog()
    const dialog = wrapper.find('[role="alertdialog"]')
    expect(dialog.exists()).toBe(true)
    expect(wrapper.find('.fixed.inset-0').attributes('aria-hidden')).toBeUndefined()
  })

  it('shows the title and message, with a default "Got it" dismiss label', () => {
    const wrapper = mountDialog()
    expect(wrapper.text()).toContain('Not yet available')
    expect(wrapper.text()).toContain('This feature is coming soon.')
    expect(wrapper.text()).toContain('Got it')
  })

  it('respects a custom dismissLabel', () => {
    const wrapper = mountDialog(true, { dismissLabel: 'Understood' })
    expect(wrapper.text()).toContain('Understood')
    expect(wrapper.text()).not.toContain('Got it')
  })

  it('emits close when the dismiss button is clicked', async () => {
    const wrapper = mountDialog()
    await wrapper.findAll('button').find((b) => b.text() === 'Got it')!.trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('emits close on Escape', async () => {
    const wrapper = mount(NoticeDialog, {
      props: { open: false, title: 't', message: 'm' },
      attachTo: document.body,
    })
    await wrapper.setProps({ open: true })
    await vi.waitUntil(() => document.activeElement?.tagName === 'BUTTON')
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('close')).toHaveLength(1)
    wrapper.unmount()
  })
})

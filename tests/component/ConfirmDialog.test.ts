import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'

function mountDialog(props: Partial<InstanceType<typeof ConfirmDialog>['$props']> = {}, open = true) {
  return mount(ConfirmDialog, {
    props: { open, title: 'Delete rule', message: 'Delete "Block spam"? This cannot be undone.', ...props },
    attachTo: document.body,
  })
}

describe('ConfirmDialog', () => {
  it('does not render when closed', () => {
    const wrapper = mountDialog({}, false)
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

  it('shows the title and message', () => {
    const wrapper = mountDialog()
    expect(wrapper.text()).toContain('Delete rule')
    expect(wrapper.text()).toContain('Delete "Block spam"? This cannot be undone.')
  })

  it('emits confirm and cancel from their respective buttons', async () => {
    const wrapper = mountDialog()
    await wrapper.findAll('button').find((b) => b.text() === 'Cancel')!.trigger('click')
    expect(wrapper.emitted('cancel')).toHaveLength(1)

    await wrapper.findAll('button').find((b) => b.text() === 'Confirm')!.trigger('click')
    expect(wrapper.emitted('confirm')).toHaveLength(1)
  })

  it('disables Confirm until requireInput is typed exactly', async () => {
    const wrapper = mountDialog({ requireInput: 'delete-me' })
    const confirmBtn = wrapper.findAll('button').find((b) => b.text() === 'Confirm')!
    expect((confirmBtn.element as HTMLButtonElement).disabled).toBe(true)

    await wrapper.find('input').setValue('delete-me')
    expect((confirmBtn.element as HTMLButtonElement).disabled).toBe(false)
  })

  it('emits cancel on Escape', async () => {
    const wrapper = mount(ConfirmDialog, {
      props: { open: false, title: 't', message: 'm' },
      attachTo: document.body,
    })
    await wrapper.setProps({ open: true })
    await vi.waitUntil(() => document.activeElement?.tagName === 'BUTTON')
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('cancel')).toHaveLength(1)
    wrapper.unmount()
  })
})

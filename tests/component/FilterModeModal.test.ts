import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import FilterModeModal from '@/components/ui/FilterModeModal.vue'

const MODES = [
  { value: 'allow_all', label: 'Allow all', description: 'Let everything through.' },
  { value: 'quarantine_visible', label: 'Quarantine', description: 'Hold for review.' },
]

function mountModal(open = true, currentMode = 'allow_all') {
  return mount(FilterModeModal, {
    props: { open, title: 'Policy for example.com', currentMode, modes: MODES },
    attachTo: document.body,
  })
}

describe('FilterModeModal', () => {
  it('does not render when closed', () => {
    const wrapper = mountModal(false)
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  })

  it('renders role="dialog" reachable from an ancestor with no aria-hidden', () => {
    // Regression test: aria-hidden="true" on the backdrop used to hide this
    // entire subtree from the accessibility tree even though it's visibly on
    // screen, breaking getByRole('dialog')-style queries.
    const wrapper = mountModal()
    const dialog = wrapper.find('[role="dialog"]')
    expect(dialog.exists()).toBe(true)
    expect(wrapper.find('.fixed.inset-0').attributes('aria-hidden')).toBeUndefined()
  })

  it('lists every mode with its label and description', () => {
    const wrapper = mountModal()
    expect(wrapper.text()).toContain('Allow all')
    expect(wrapper.text()).toContain('Let everything through.')
    expect(wrapper.text()).toContain('Quarantine')
    expect(wrapper.text()).toContain('Hold for review.')
  })

  it('Save is disabled until a different mode is picked, then emits select + close', async () => {
    const wrapper = mountModal()
    const saveBtn = wrapper.findAll('button').find((b) => b.text() === 'Save')!
    expect((saveBtn.element as HTMLButtonElement).disabled).toBe(true)

    await wrapper.findAll('button').find((b) => b.text().includes('Quarantine'))!.trigger('click')
    expect((saveBtn.element as HTMLButtonElement).disabled).toBe(false)

    await saveBtn.trigger('click')
    expect(wrapper.emitted('select')?.[0]).toEqual(['quarantine_visible'])
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('Cancel emits close without emitting select', async () => {
    const wrapper = mountModal()
    await wrapper.findAll('button').find((b) => b.text().includes('Quarantine'))!.trigger('click')
    await wrapper.findAll('button').find((b) => b.text() === 'Cancel')!.trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
    expect(wrapper.emitted('select')).toBeUndefined()
  })

  it('emits close on Escape', async () => {
    const wrapper = mount(FilterModeModal, {
      props: { open: false, title: 't', currentMode: 'allow_all', modes: MODES },
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

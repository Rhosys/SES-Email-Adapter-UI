import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, DOMWrapper } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import FeatureTour from '@/components/FeatureTour.vue'
import { useFeatureTour } from '@/composables/useFeatureTour'
import { useAccountStore } from '@/stores/account'
import type { Account } from '@/types/server'

function addTourTarget(dataTour: string, rect: Partial<DOMRect> = {}) {
  const el = document.createElement('div')
  el.setAttribute('data-tour', dataTour)
  el.getBoundingClientRect = () =>
    ({
      left: 20, top: 100, width: 180, height: 40, right: 200, bottom: 140, x: 20, y: 100,
      toJSON() { return this },
      ...rect,
    }) as DOMRect
  document.body.appendChild(el)
  return el
}

describe('FeatureTour', () => {
  let mountedWrapper: ReturnType<typeof mount> | null = null
  // FeatureTour teleports its whole template to <body>, and this VTU version
  // doesn't follow Teleport via wrapper.find() — it only sees the teleport
  // markers left in the component's own tree. Query the real DOM directly.
  const body = () => new DOMWrapper(document.body)

  function mountTour() {
    mountedWrapper = mount(FeatureTour, { attachTo: document.body })
    return mountedWrapper
  }

  beforeEach(() => {
    setActivePinia(createPinia())
    useAccountStore().account = { accountId: 'acc_1', name: 'Test' } as Account
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
      matches: true, // desktop by default; individual tests override
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
  })

  afterEach(() => {
    mountedWrapper?.unmount()
    mountedWrapper = null
    document.body.innerHTML = ''
    useFeatureTour().endTour()
    vi.unstubAllGlobals()
  })

  it('does not render when the tour is inactive', () => {
    mountTour()
    expect(body().find('[role="dialog"]').exists()).toBe(false)
  })

  it('renders and spotlights the first step when started after mounting', async () => {
    addTourTarget('nav-inbox')
    mountTour()
    useFeatureTour().startTour({ force: true })
    await vi.waitUntil(() => body().find('[role="dialog"]').exists())
    await vi.waitUntil(() => body().find('.absolute.rounded-lg').exists())
    expect(body().text()).toContain('Your inbox')
  })

  // The onboarding-completion flow calls startTour() on a route rendered
  // OUTSIDE AppLayout, so FeatureTour doesn't even exist yet when tourActive
  // flips true — by the time it later mounts (after the redirect into
  // AppLayout), tourActive is already true and the plain watch() never fires
  // for it (watchers only react to *changes*). This is the regression guard
  // for that path.
  it('spotlights the first step when tourActive was already true before mounting', async () => {
    addTourTarget('nav-inbox')
    useFeatureTour().startTour({ force: true })
    mountTour()
    expect(body().find('[role="dialog"]').exists()).toBe(true)
    await vi.waitUntil(() => body().find('.absolute.rounded-lg').exists())
    expect(body().text()).toContain('Your inbox')
  })

  it('advances to the next step and re-spotlights its target', async () => {
    addTourTarget('nav-inbox')
    addTourTarget('nav-quarantine')
    mountTour()
    useFeatureTour().startTour({ force: true })
    await vi.waitUntil(() => body().text().includes('Your inbox'))

    const nextButton = body().findAll('button').find((b) => b.text().includes('Next'))!
    await nextButton.trigger('click')
    expect(body().text()).toContain('Quarantine')
  })
})

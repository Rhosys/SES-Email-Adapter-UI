import { describe, it, expect, vi, afterEach } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'
import { useIsMobile } from '@/composables/useIsMobile'

function mockMatchMedia(initialMatches: boolean) {
  const listeners = new Set<(e: { matches: boolean }) => void>()
  let matches = initialMatches
  const mql = {
    get matches() {
      return matches
    },
    addEventListener: (_: string, cb: (e: { matches: boolean }) => void) => listeners.add(cb),
    removeEventListener: (_: string, cb: (e: { matches: boolean }) => void) => listeners.delete(cb),
  }
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(mql))
  return {
    setMatches(value: boolean) {
      matches = value
      listeners.forEach((cb) => cb({ matches: value }))
    },
  }
}

function mountProbe() {
  let exposedIsMobile: ReturnType<typeof useIsMobile> | undefined
  const Probe = defineComponent({
    setup() {
      exposedIsMobile = useIsMobile()
      return () => h('div')
    },
  })
  const wrapper = mount(Probe)
  return { wrapper, isMobile: exposedIsMobile! }
}

describe('useIsMobile', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('is false when the min-width: 640px query matches (desktop)', () => {
    mockMatchMedia(true)
    const { isMobile } = mountProbe()
    expect(isMobile.value).toBe(false)
  })

  it('is true when the min-width: 640px query does not match (mobile)', () => {
    mockMatchMedia(false)
    const { isMobile } = mountProbe()
    expect(isMobile.value).toBe(true)
  })

  it('updates reactively when the media query changes', async () => {
    const media = mockMatchMedia(true)
    const { isMobile } = mountProbe()
    expect(isMobile.value).toBe(false)

    media.setMatches(false)
    expect(isMobile.value).toBe(true)

    media.setMatches(true)
    expect(isMobile.value).toBe(false)
  })

  it('defaults to false when matchMedia is unavailable', () => {
    vi.stubGlobal('matchMedia', undefined)
    const { isMobile } = mountProbe()
    expect(isMobile.value).toBe(false)
  })
})

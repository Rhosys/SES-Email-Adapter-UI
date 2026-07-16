import { ref, onMounted, onBeforeUnmount } from 'vue'

/**
 * Reactive "are we below the sm (640px) breakpoint" check, for the rare case
 * where a component needs to branch in script (v-if) rather than just CSS.
 * Defaults to false (desktop) when matchMedia isn't available (non-browser/
 * jsdom), matching the default OverflowMenu.vue's inline equivalent uses.
 */
export function useIsMobile() {
  const isMobile = ref(false)
  let mql: MediaQueryList | null = null
  function sync() {
    if (mql) isMobile.value = !mql.matches
  }

  onMounted(() => {
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      mql = window.matchMedia('(min-width: 640px)')
      sync()
      mql.addEventListener('change', sync)
    }
  })

  onBeforeUnmount(() => {
    mql?.removeEventListener('change', sync)
  })

  return isMobile
}

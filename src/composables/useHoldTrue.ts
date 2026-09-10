import { onUnmounted, ref, watch, type Ref } from 'vue'

/**
 * Mirrors a boolean but holds `true` for at least `ms` after the source flips
 * back to `false`, so a state that resolves faster than a human can perceive
 * doesn't flicker on/off. The `true` edge always passes through immediately —
 * only the trailing edge is delayed. Does not introduce a second source of
 * truth: `source` still decides what's shown, this only smooths its timing.
 */
export function useHoldTrue(source: Ref<boolean>, ms = 100) {
  const held = ref(source.value)
  let timer: ReturnType<typeof setTimeout> | undefined

  watch(source, (isTrue) => {
    clearTimeout(timer)
    if (isTrue) {
      held.value = true
    } else {
      timer = setTimeout(() => { held.value = false }, ms)
    }
  })

  onUnmounted(() => clearTimeout(timer))

  return held
}

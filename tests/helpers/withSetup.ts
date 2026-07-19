import { createApp, defineComponent } from 'vue'

/**
 * Runs a composable inside a real Vue component instance so lifecycle hooks
 * (onMounted, onBeforeUnmount, onUnmounted) register correctly.
 *
 * Returns the composable's return value and an `unmount` function to trigger
 * cleanup lifecycle hooks.
 */
export function withSetup<T>(composable: () => T): { result: T; unmount: () => void } {
  let result!: T
  const app = createApp(
    defineComponent({
      setup() {
        result = composable()
        return () => null
      },
    }),
  )
  const root = document.createElement('div')
  app.mount(root)
  return { result, unmount: () => app.unmount() }
}

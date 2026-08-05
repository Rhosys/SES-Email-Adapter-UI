<script setup lang="ts">
import { ref, useTemplateRef, useAttrs } from 'vue'
import { useAsyncAction } from '../../composables/useAsyncAction'

defineOptions({ inheritAttrs: false })

const props = withDefaults(
  defineProps<{
    action: () => Promise<unknown>
    type?: 'button' | 'submit'
    disabled?: boolean
  }>(),
  { type: 'button', disabled: false },
)

const attrs = useAttrs()
const btnRef = useTemplateRef<HTMLButtonElement>('btn')
const lockedWidth = ref<string | undefined>()

const { state, run } = useAsyncAction(() => props.action())

async function handleClick() {
  if (state.value !== 'idle' || props.disabled) return

  const el = btnRef.value
  if (el) lockedWidth.value = `${el.offsetWidth}px`

  await run()
  lockedWidth.value = undefined
}
</script>

<template>
  <button
    ref="btn"
    v-bind="attrs"
    :type="type"
    :disabled="disabled || state !== 'idle'"
    :style="lockedWidth ? { minWidth: lockedWidth } : undefined"
    class="inline-flex items-center justify-center disabled:opacity-50"
    @click="handleClick"
  >
    <!-- Spinner -->
    <svg
      v-if="state === 'pending'"
      class="h-4 w-4 animate-spin"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>

    <!-- Checkmark -->
    <svg
      v-else-if="state === 'success'"
      class="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      stroke-width="2.5"
      aria-hidden="true"
    >
      <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
    </svg>

    <!-- Default slot -->
    <slot v-else />
  </button>
</template>

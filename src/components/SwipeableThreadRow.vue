<script setup lang="ts">
import { useSlots } from 'vue'
import { useSwipeableRow } from '@/composables/useSwipeableRow'

// Wraps a thread-list row with touch gestures: long-press to select, and swipe
// to reveal a quick action (provided via the #action slot). Desktop is untouched
// — touch handlers simply never fire, so the row's hover controls still work.
const props = defineProps<{ swipeEnabled?: boolean }>()
const emit = defineEmits<{ 'long-press': [] }>()
const slots = useSlots()

const hasAction = () => props.swipeEnabled !== false && !!slots.action

const { offset, dragging, close, onTouchStart, onTouchMove, onTouchEnd, consumeClick } = useSwipeableRow({
  enabled: hasAction,
  onLongPress: () => emit('long-press'),
})

function onClickCapture(e: MouseEvent) {
  // Taps on the revealed action button must pass through to it.
  if ((e.target as Element).closest?.('[data-swipe-action]')) return
  if (consumeClick()) {
    e.preventDefault()
    e.stopPropagation()
  }
}
</script>

<template>
  <!-- data-h-swipe opts this region out of the app-level sidebar swipe. The
       click handler only suppresses the trailing click after a gesture; the real
       interactive controls (link, checkbox, action button) live in the slots. -->
  <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions,vuejs-accessibility/click-events-have-key-events -->
  <div
    class="relative select-none overflow-hidden"
    data-h-swipe
    style="touch-action: pan-y"
    @touchstart.passive="onTouchStart"
    @touchmove="onTouchMove"
    @touchend="onTouchEnd"
    @touchcancel="onTouchEnd"
    @click.capture="onClickCapture"
  >
    <!-- Quick action, revealed behind the sliding content on the trailing edge. -->
    <div
      v-if="$slots.action && offset !== 0"
      data-swipe-action
      class="absolute inset-y-0 flex"
      :class="offset > 0 ? 'left-0' : 'right-0'"
    >
      <slot name="action" :close="close" />
    </div>

    <!-- Sliding content (opaque so the action layer stays hidden until swiped). -->
    <div
      class="relative bg-ctp-base"
      :style="{ transform: `translateX(${offset}px)`, transition: dragging ? 'none' : 'transform 0.25s ease' }"
    >
      <slot />
    </div>
  </div>
</template>

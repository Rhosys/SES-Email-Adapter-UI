<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'

// A kebab (⋮) overflow menu that adapts to the viewport:
//   • Desktop (≥ sm): the familiar dropdown anchored to the trigger.
//   • Mobile (< sm): a first-class bottom sheet with a dimmed backdrop.
// Either way, tapping/clicking away or pressing Escape closes it, and picking
// any item closes it too (the item's own @click still fires first). Menu items
// are supplied via the default slot so each call site keeps its own actions.
withDefaults(
  defineProps<{
    /** aria-label for the trigger button. */
    label?: string
    /** Which edge the desktop dropdown aligns to. */
    align?: 'left' | 'right'
    /** Width/utility classes for the desktop dropdown panel. */
    menuWidthClass?: string
    /** Classes for the default kebab trigger button. */
    triggerClass?: string
    /** Classes for the kebab icon. */
    iconClass?: string
    /** Optional heading shown at the top of the mobile bottom sheet. */
    sheetTitle?: string
  }>(),
  {
    label: 'Actions',
    align: 'right',
    menuWidthClass: 'min-w-48',
    triggerClass:
      'flex h-9 w-9 items-center justify-center rounded-lg text-ctp-subtext0 transition-colors hover:bg-ctp-surface1 hover:text-ctp-text',
    iconClass: 'h-4 w-4',
    sheetTitle: '',
  },
)

const open = ref(false)
function toggle() {
  open.value = !open.value
}
function close() {
  open.value = false
}

// Desktop keeps the anchored dropdown; narrow viewports get the bottom sheet.
// In non-browser/jsdom (no matchMedia) we default to desktop so the menu
// renders inline rather than teleporting.
const isDesktop = ref(true)
let mql: MediaQueryList | null = null
function syncViewport() {
  if (mql) isDesktop.value = mql.matches
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') close()
}

watch(open, (isOpen) => {
  if (isOpen) {
    document.addEventListener('keydown', onKeydown)
  } else {
    document.removeEventListener('keydown', onKeydown)
  }
})

onMounted(() => {
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    mql = window.matchMedia('(min-width: 640px)')
    syncViewport()
    mql.addEventListener('change', syncViewport)
  }
})

onBeforeUnmount(() => {
  mql?.removeEventListener('change', syncViewport)
  document.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div class="relative">
    <!-- Trigger: custom via slot, or the default kebab button -->
    <slot name="trigger" :open="open" :toggle="toggle">
      <button
        type="button"
        :class="triggerClass"
        :aria-label="label"
        aria-haspopup="menu"
        :aria-expanded="open"
        @click.stop="toggle"
      >
        <svg :class="iconClass" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <circle cx="8" cy="2.5" r="1.5" /><circle cx="8" cy="8" r="1.5" /><circle cx="8" cy="13.5" r="1.5" />
        </svg>
      </button>
    </slot>

    <!-- Desktop: anchored dropdown -->
    <template v-if="open && isDesktop">
      <div
        role="menu"
        tabindex="-1"
        class="absolute top-full z-20 mt-1 rounded-lg border border-ctp-surface1 bg-ctp-mantle py-1.5 shadow-lg"
        :class="[menuWidthClass, align === 'right' ? 'right-0' : 'left-0']"
        @click="close"
        @keydown.escape="close"
      >
        <slot :close="close" />
      </div>
      <!-- Click-outside backdrop -->
      <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions,vuejs-accessibility/click-events-have-key-events -->
      <div class="fixed inset-0 z-10" @click="close" />
    </template>

    <!-- Mobile: bottom sheet -->
    <Teleport v-if="!isDesktop" to="body">
      <Transition name="overflow-sheet">
        <div v-if="open" class="fixed inset-0 z-[200] flex flex-col justify-end">
          <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions,vuejs-accessibility/click-events-have-key-events -->
          <div class="absolute inset-0 bg-ctp-base/70" @click="close" />
          <div
            class="overflow-sheet__panel relative max-h-[80dvh] overflow-y-auto rounded-t-2xl border-t border-ctp-surface1 bg-ctp-mantle pb-[env(safe-area-inset-bottom)] shadow-2xl"
          >
            <!-- Grab handle -->
            <div class="flex justify-center pt-2.5">
              <span class="h-1 w-9 rounded-full bg-ctp-surface2" aria-hidden="true" />
            </div>
            <p v-if="sheetTitle" class="px-5 pb-1 pt-2 text-xs font-medium uppercase tracking-wide text-ctp-subtext0">
              {{ sheetTitle }}
            </p>
            <!-- Slot items, enlarged for touch -->
            <div
              role="menu"
              tabindex="-1"
              class="flex flex-col py-1 text-ctp-text [&_a]:px-5 [&_a]:py-3.5 [&_a]:text-sm [&_button]:w-full [&_button]:px-5 [&_button]:py-3.5 [&_button]:text-sm"
              @click="close"
              @keydown.escape="close"
            >
              <slot :close="close" />
            </div>
            <button
              type="button"
              class="w-full border-t border-ctp-surface0 px-5 py-3.5 text-center text-sm font-medium text-ctp-subtext1 hover:bg-ctp-surface0 hover:text-ctp-text"
              @click="close"
            >
              Cancel
            </button>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.overflow-sheet-enter-active,
.overflow-sheet-leave-active {
  transition: opacity 0.2s ease;
}
.overflow-sheet-enter-active .overflow-sheet__panel,
.overflow-sheet-leave-active .overflow-sheet__panel {
  transition: transform 0.25s ease;
}
.overflow-sheet-enter-from,
.overflow-sheet-leave-to {
  opacity: 0;
}
.overflow-sheet-enter-from .overflow-sheet__panel,
.overflow-sheet-leave-to .overflow-sheet__panel {
  transform: translateY(100%);
}
</style>

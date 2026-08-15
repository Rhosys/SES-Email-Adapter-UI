<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { DateTime } from 'luxon'
import { useIsMobile } from '@/composables/useIsMobile'
import InlineCalendar from './InlineCalendar.vue'

const emit = defineEmits<{ snooze: [isoTime: string] }>()

const open = ref(false)
const isMobile = useIsMobile()
const selectedDate = ref<string | null>(null)

const minDate = computed(() => DateTime.local().plus({ days: 1 }).toISODate()!)

// The backend's followupAt schema (Zod's z.iso.datetime()) only accepts UTC
// timestamps with a literal 'Z' suffix — Luxon's default .toISO() emits a
// numeric offset (e.g. +02:00, or even +00:00 in the UTC zone) instead, which
// that schema rejects outright. Always normalize to UTC before serializing.
function laterToday(): string {
  const now = DateTime.local()
  const target = now.hour < 17 ? now.set({ hour: 17, minute: 0, second: 0, millisecond: 0 }) : now.plus({ hours: 3 }).startOf('hour')
  return target.toUTC().toISO()!
}

function tomorrowMorning(): string {
  return DateTime.local().plus({ days: 1 }).set({ hour: 9, minute: 0, second: 0, millisecond: 0 }).toUTC().toISO()!
}

function nextWeek(): string {
  return DateTime.local().plus({ weeks: 1 }).startOf('day').set({ hour: 9 }).toUTC().toISO()!
}

function toggle() {
  open.value = !open.value
}

function close() {
  open.value = false
}

// Reset the calendar's pick each time the picker is opened fresh.
watch(open, (isOpen) => {
  if (isOpen) selectedDate.value = null
})

function selectPreset(isoTime: string) {
  emit('snooze', isoTime)
  close()
}

const confirmLabel = computed(() =>
  selectedDate.value ? `Snooze until ${DateTime.fromISO(selectedDate.value).toFormat('MMM d')}` : 'Snooze',
)

function confirmCustomDate() {
  if (!selectedDate.value) return
  const dt = DateTime.fromISO(selectedDate.value).set({ hour: 9, minute: 0, second: 0, millisecond: 0 })
  emit('snooze', dt.toUTC().toISO()!)
  close()
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') close()
}

watch(open, (isOpen) => {
  if (isOpen) document.addEventListener('keydown', onKeydown)
  else document.removeEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div class="relative">
    <button
      type="button"
      class="btn hover:border-ctp-mauve hover:text-ctp-mauve"
      title="Snooze"
      aria-haspopup="dialog"
      :aria-expanded="open"
      @click.prevent.stop="toggle"
    >
      <svg class="h-3 w-3" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
        <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 1.5a5.5 5.5 0 110 11 5.5 5.5 0 010-11zM7.25 4v4.5l3.5 2.1.75-1.23-2.75-1.64V4h-1.5z"/>
      </svg>
      <span>Snooze</span>
    </button>

    <!-- Desktop: anchored popover -->
    <template v-if="open && !isMobile">
      <div
        role="dialog"
        aria-label="Snooze until…"
        class="absolute right-0 top-full z-20 mt-1 w-72 rounded-lg border border-ctp-surface1 bg-ctp-mantle p-3 shadow-lg"
      >
        <div class="mb-2 flex flex-col gap-0.5">
          <button
            class="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-ctp-text hover:bg-ctp-surface0"
            @click="selectPreset(laterToday())"
          >
            <span class="text-ctp-subtext0">🌆</span> Later today
          </button>
          <button
            class="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-ctp-text hover:bg-ctp-surface0"
            @click="selectPreset(tomorrowMorning())"
          >
            <span class="text-ctp-subtext0">🌅</span> Tomorrow morning
          </button>
          <button
            class="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-ctp-text hover:bg-ctp-surface0"
            @click="selectPreset(nextWeek())"
          >
            <span class="text-ctp-subtext0">📅</span> Next week
          </button>
        </div>

        <div class="border-t border-ctp-surface0 pt-2">
          <InlineCalendar v-model="selectedDate" :min-date="minDate" />
        </div>

        <div class="mt-3 flex justify-end gap-2 border-t border-ctp-surface0 pt-2.5">
          <button
            class="rounded-lg px-3 py-1.5 text-sm text-ctp-subtext1 hover:text-ctp-text"
            @click="close"
          >
            Cancel
          </button>
          <button
            class="rounded-lg bg-ctp-mauve px-3 py-1.5 text-sm font-medium text-ctp-base hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            :disabled="!selectedDate"
            @click="confirmCustomDate"
          >
            {{ confirmLabel }}
          </button>
        </div>
      </div>
      <!-- Click-outside backdrop -->
      <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions,vuejs-accessibility/click-events-have-key-events -->
      <div class="fixed inset-0 z-10" @click="close" />
    </template>

    <!-- Mobile: full-screen slide-up -->
    <Teleport v-if="isMobile" to="body">
      <Transition name="snooze-sheet">
        <div v-if="open" class="fixed inset-0 z-[200] flex flex-col bg-ctp-base">
          <div class="flex shrink-0 items-center justify-between border-b border-ctp-surface0 px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))]">
            <p class="text-base font-semibold text-ctp-text">Snooze until…</p>
            <button
              type="button"
              class="flex h-9 w-9 items-center justify-center rounded-full text-ctp-subtext1 hover:bg-ctp-surface1 hover:text-ctp-text"
              aria-label="Close"
              @click="close"
            >
              <svg class="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
                <path d="M3 3l10 10M13 3L3 13" />
              </svg>
            </button>
          </div>

          <div class="flex-1 overflow-y-auto px-4 py-3">
            <div class="mb-3 flex flex-col gap-1">
              <button
                class="flex items-center gap-2.5 rounded-lg px-3 py-3 text-left text-[15px] text-ctp-text hover:bg-ctp-surface0"
                @click="selectPreset(laterToday())"
              >
                <span class="text-ctp-subtext0">🌆</span> Later today
              </button>
              <button
                class="flex items-center gap-2.5 rounded-lg px-3 py-3 text-left text-[15px] text-ctp-text hover:bg-ctp-surface0"
                @click="selectPreset(tomorrowMorning())"
              >
                <span class="text-ctp-subtext0">🌅</span> Tomorrow morning
              </button>
              <button
                class="flex items-center gap-2.5 rounded-lg px-3 py-3 text-left text-[15px] text-ctp-text hover:bg-ctp-surface0"
                @click="selectPreset(nextWeek())"
              >
                <span class="text-ctp-subtext0">📅</span> Next week
              </button>
            </div>

            <div class="border-t border-ctp-surface0 pt-3">
              <InlineCalendar v-model="selectedDate" :min-date="minDate" />
            </div>
          </div>

          <div class="shrink-0 border-t border-ctp-surface0 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
            <button
              type="button"
              class="w-full rounded-lg bg-ctp-mauve py-3 text-center text-sm font-semibold text-ctp-base disabled:cursor-not-allowed disabled:opacity-40"
              :disabled="!selectedDate"
              @click="confirmCustomDate"
            >
              {{ confirmLabel }}
            </button>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.snooze-sheet-enter-active,
.snooze-sheet-leave-active {
  transition: transform 0.25s ease;
}
.snooze-sheet-enter-from,
.snooze-sheet-leave-to {
  transform: translateY(100%);
}
</style>

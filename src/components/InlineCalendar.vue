<script setup lang="ts">
import { ref, computed } from 'vue'
import { DateTime } from 'luxon'

const props = defineProps<{
  /** Selected date as an ISO date (yyyy-MM-dd), or null for no selection. */
  modelValue: string | null
  /** Earliest selectable date (ISO date). Days before this are disabled. */
  minDate: string
}>()

const emit = defineEmits<{ 'update:modelValue': [isoDate: string] }>()

const min = computed(() => DateTime.fromISO(props.minDate).startOf('day'))
const today = computed(() => DateTime.local().startOf('day'))

const viewMonth = ref(
  (props.modelValue ? DateTime.fromISO(props.modelValue) : min.value).startOf('month'),
)

const monthLabel = computed(() => viewMonth.value.toFormat('MMMM yyyy'))

const canGoPrevMonth = computed(() => viewMonth.value.startOf('month') > min.value.startOf('month'))

function prevMonth() {
  if (!canGoPrevMonth.value) return
  viewMonth.value = viewMonth.value.minus({ months: 1 })
}

function nextMonth() {
  viewMonth.value = viewMonth.value.plus({ months: 1 })
}

const weekdayLabels = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

interface DayCell {
  iso: string
  day: number
  isToday: boolean
  isSelected: boolean
  isDisabled: boolean
}

// Sunday-first grid: enough leading blanks to align the 1st with its weekday,
// then every day in the month.
const weeks = computed((): (DayCell | null)[][] => {
  const first = viewMonth.value.startOf('month')
  const daysInMonth = first.daysInMonth ?? 30
  const leadingBlanks = first.weekday % 7 // Luxon: Monday=1..Sunday=7 → Sunday-start offset

  const cells: (DayCell | null)[] = Array.from({ length: leadingBlanks }, () => null)
  for (let d = 1; d <= daysInMonth; d++) {
    const date = first.set({ day: d })
    const iso = date.toISODate()!
    cells.push({
      iso,
      day: d,
      isToday: date.equals(today.value),
      isSelected: iso === props.modelValue,
      isDisabled: date < min.value,
    })
  }
  while (cells.length % 7 !== 0) cells.push(null)

  const rows: (DayCell | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7))
  return rows
})

function selectDay(cell: DayCell | null) {
  if (!cell || cell.isDisabled) return
  emit('update:modelValue', cell.iso)
}
</script>

<template>
  <div>
    <div class="mb-2 flex items-center justify-between">
      <button
        type="button"
        class="flex h-8 w-8 items-center justify-center rounded-lg text-ctp-subtext1 hover:bg-ctp-surface1 hover:text-ctp-text disabled:pointer-events-none disabled:opacity-30"
        aria-label="Previous month"
        :disabled="!canGoPrevMonth"
        @click="prevMonth"
      >
        <svg class="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M10 3.5L5.5 8l4.5 4.5" />
        </svg>
      </button>
      <p class="text-sm font-medium text-ctp-text" aria-live="polite">{{ monthLabel }}</p>
      <button
        type="button"
        class="flex h-8 w-8 items-center justify-center rounded-lg text-ctp-subtext1 hover:bg-ctp-surface1 hover:text-ctp-text"
        aria-label="Next month"
        @click="nextMonth"
      >
        <svg class="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M6 3.5L10.5 8 6 12.5" />
        </svg>
      </button>
    </div>

    <div class="grid grid-cols-7 gap-y-1 text-center">
      <span v-for="wd in weekdayLabels" :key="wd" class="text-xs font-medium text-ctp-subtext0">{{ wd }}</span>

      <template v-for="(week, wi) in weeks" :key="wi">
        <template v-for="(cell, di) in week" :key="di">
          <button
            v-if="cell"
            type="button"
            class="mx-auto flex h-9 w-9 items-center justify-center rounded-full text-sm transition-colors sm:h-8 sm:w-8"
            :class="[
              cell.isSelected
                ? 'bg-ctp-mauve font-semibold text-ctp-base'
                : cell.isDisabled
                  ? 'cursor-not-allowed text-ctp-overlay0'
                  : 'text-ctp-text hover:bg-ctp-surface1',
              cell.isToday && !cell.isSelected && 'ring-1 ring-inset ring-ctp-mauve',
            ]"
            :disabled="cell.isDisabled"
            :aria-current="cell.isToday ? 'date' : undefined"
            :aria-pressed="cell.isSelected"
            @click="selectDay(cell)"
          >
            {{ cell.day }}
          </button>
          <span v-else />
        </template>
      </template>
    </div>
  </div>
</template>

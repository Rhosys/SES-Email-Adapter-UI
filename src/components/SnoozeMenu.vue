<script setup lang="ts">
import { ref } from 'vue'
import { DateTime } from 'luxon'
import OverflowMenu from './ui/OverflowMenu.vue'

const emit = defineEmits<{ snooze: [isoTime: string] }>()

const customDate = ref('')
const showCustom = ref(false)

function laterToday(): string {
  const now = DateTime.local()
  const target = now.hour < 17 ? now.set({ hour: 17, minute: 0, second: 0, millisecond: 0 }) : now.plus({ hours: 3 }).startOf('hour')
  return target.toISO()!
}

function tomorrowMorning(): string {
  return DateTime.local().plus({ days: 1 }).set({ hour: 9, minute: 0, second: 0, millisecond: 0 }).toISO()!
}

function nextWeek(): string {
  return DateTime.local().plus({ weeks: 1 }).set({ hour: 9, minute: 0, second: 0, millisecond: 0 }).startOf('day').set({ hour: 9 }).toISO()!
}

function selectPreset(isoTime: string) {
  emit('snooze', isoTime)
}

function submitCustom() {
  if (!customDate.value) return
  const dt = DateTime.fromISO(customDate.value).set({ hour: 9, minute: 0, second: 0 })
  if (dt > DateTime.local()) {
    emit('snooze', dt.toISO()!)
  }
  showCustom.value = false
  customDate.value = ''
}
</script>

<template>
  <OverflowMenu label="Snooze" align="right" sheet-title="Snooze until…">
    <template #trigger="{ toggle }">
      <button
        type="button"
        class="flex h-7 items-center gap-1 rounded border border-ctp-surface1 px-2 text-xs text-ctp-subtext1 hover:border-ctp-mauve hover:text-ctp-mauve"
        title="Snooze"
        @click.prevent.stop="toggle"
      >
        <svg class="h-3 w-3" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 1.5a5.5 5.5 0 110 11 5.5 5.5 0 010-11zM7.25 4v4.5l3.5 2.1.75-1.23-2.75-1.64V4h-1.5z"/>
        </svg>
      </button>
    </template>

    <template #default="{ close }">
      <button
        class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ctp-text hover:bg-ctp-surface0"
        @click="selectPreset(laterToday()); close()"
      >
        <span class="text-ctp-subtext0">🌆</span> Later today
      </button>
      <button
        class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ctp-text hover:bg-ctp-surface0"
        @click="selectPreset(tomorrowMorning()); close()"
      >
        <span class="text-ctp-subtext0">🌅</span> Tomorrow morning
      </button>
      <button
        class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ctp-text hover:bg-ctp-surface0"
        @click="selectPreset(nextWeek()); close()"
      >
        <span class="text-ctp-subtext0">📅</span> Next week
      </button>
      <div class="border-t border-ctp-surface0 px-3 py-2">
        <div v-if="!showCustom">
          <button
            class="flex w-full items-center gap-2 text-left text-sm text-ctp-subtext1 hover:text-ctp-text"
            @click.stop="showCustom = true"
          >
            <span class="text-ctp-subtext0">📌</span> Pick a date
          </button>
        </div>
        <div v-else class="flex items-center gap-2" @click.stop>
          <input
            v-model="customDate"
            type="date"
            aria-label="Snooze until date"
            class="flex-1 rounded border border-ctp-surface1 bg-ctp-base px-2 py-1 text-sm text-ctp-text"
            :min="DateTime.local().plus({ days: 1 }).toISODate()!"
          />
          <button
            class="rounded bg-ctp-mauve px-2 py-1 text-xs font-medium text-ctp-base hover:opacity-90"
            :disabled="!customDate"
            @click="submitCustom(); close()"
          >
            Set
          </button>
        </div>
      </div>
    </template>
  </OverflowMenu>
</template>

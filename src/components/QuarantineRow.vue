<script setup lang="ts">
import { ref, inject, computed } from 'vue'
import type { BlockReason, DismissReason, Signal } from '@/types/server'
import { NOW_KEY } from '@/composables/useRelativeTime'
import { formatRelativeTime } from '@/composables/useFormattedTime'

const props = defineProps<{
  signal: Signal
  pending: boolean
}>()

const emit = defineEmits<{
  (e: 'allow', id: string): void
  (e: 'dismiss', id: string, reason: DismissReason): void
}>()

const now = inject(NOW_KEY)
const timestamp = computed(() =>
  now ? formatRelativeTime(props.signal.receivedAt, now.value) : '',
)

const dismissOpen = ref(false)
const dismissReason = ref<DismissReason>('spam')

const blockReasonLabel: Record<BlockReason, string> = {
  new_sender: 'New sender',
  spam: 'Spam',
  sender_mismatch: 'Sender mismatch',
  reputation: 'Poor reputation',
  onboarding: 'Onboarding hold',
}

const blockReasonColor: Record<BlockReason, string> = {
  new_sender: 'bg-ctp-blue/15 text-ctp-blue',
  spam: 'bg-ctp-red/15 text-ctp-red',
  sender_mismatch: 'bg-ctp-peach/15 text-ctp-peach',
  reputation: 'bg-ctp-maroon/15 text-ctp-maroon',
  onboarding: 'bg-ctp-yellow/15 text-ctp-yellow',
}

const dismissReasonOptions: { value: DismissReason; label: string }[] = [
  { value: 'spam', label: 'Spam' },
  { value: 'not_relevant', label: 'Not relevant' },
  { value: 'unwanted', label: 'Unwanted' },
  { value: 'other', label: 'Other' },
]

function onAllow() {
  emit('allow', props.signal.id)
}

function onDismissConfirm() {
  emit('dismiss', props.signal.id, dismissReason.value)
  dismissOpen.value = false
}
</script>

<template>
  <div
    class="flex items-start gap-3 border-b border-ctp-surface0 px-4 py-3 transition-colors hover:bg-ctp-surface0"
    :class="{ 'opacity-50': pending }"
  >
    <!-- Block reason badge -->
    <div class="mt-0.5 shrink-0">
      <span
        v-if="signal.blockReason"
        class="inline-block rounded-full px-2 py-0.5 text-xs font-medium"
        :class="blockReasonColor[signal.blockReason]"
      >
        {{ blockReasonLabel[signal.blockReason] }}
      </span>
      <span
        v-else
        class="inline-block rounded-full bg-ctp-surface1 px-2 py-0.5 text-xs text-ctp-subtext0"
      >
        Blocked
      </span>
    </div>

    <!-- Content -->
    <div class="min-w-0 flex-1">
      <div class="flex items-center justify-between gap-2">
        <p class="truncate text-sm font-medium text-ctp-text">
          {{ signal.from.name || signal.from.address }}
          <span class="font-normal text-ctp-subtext0">&lt;{{ signal.from.address }}&gt;</span>
        </p>
        <span class="shrink-0 text-xs text-ctp-subtext0">{{ timestamp }}</span>
      </div>

      <p class="mt-0.5 truncate text-sm text-ctp-subtext1">{{ signal.subject }}</p>

      <div class="mt-1 flex items-center gap-2">
        <span
          v-if="signal.spamScore !== undefined"
          class="text-xs"
          :class="signal.spamScore > 5 ? 'text-ctp-red' : 'text-ctp-subtext0'"
        >
          Spam score: {{ signal.spamScore.toFixed(1) }}
        </span>
      </div>

      <!-- Actions -->
      <div class="relative mt-2 flex items-center gap-2">
        <button
          class="rounded bg-ctp-green/15 px-3 py-1 text-xs font-medium text-ctp-green transition-colors hover:bg-ctp-green/25 disabled:opacity-50"
          :disabled="pending"
          @click="onAllow"
        >
          Allow
        </button>

        <div class="relative">
          <button
            class="rounded bg-ctp-red/15 px-3 py-1 text-xs font-medium text-ctp-red transition-colors hover:bg-ctp-red/25 disabled:opacity-50"
            :disabled="pending"
            @click="dismissOpen = !dismissOpen"
          >
            Dismiss ▾
          </button>

          <!-- Dismiss reason picker -->
          <div
            v-if="dismissOpen"
            class="absolute left-0 top-full z-10 mt-1 w-48 rounded-lg border border-ctp-surface1 bg-ctp-mantle p-2 shadow-lg"
          >
            <p class="mb-1.5 text-xs text-ctp-subtext0">Reason</p>
            <select
              v-model="dismissReason"
              class="mb-2 w-full rounded border border-ctp-surface1 bg-ctp-surface0 px-2 py-1 text-xs text-ctp-text"
            >
              <option v-for="opt in dismissReasonOptions" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </select>
            <div class="flex gap-1.5">
              <button
                class="flex-1 rounded bg-ctp-red px-2 py-1 text-xs font-medium text-ctp-base transition-opacity hover:opacity-80"
                @click="onDismissConfirm"
              >
                Confirm
              </button>
              <button
                class="rounded border border-ctp-surface1 px-2 py-1 text-xs text-ctp-subtext0 hover:text-ctp-text"
                @click="dismissOpen = false"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

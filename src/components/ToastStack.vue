<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useToast, type ToastItem } from '@/composables/useToast'

const { toasts, undo, dismiss } = useToast()

// Tick every 250 ms to keep the ring and countdown text live.
const _tick = ref(0)
let tickInterval: ReturnType<typeof setInterval> | null = null
onMounted(() => { tickInterval = setInterval(() => { _tick.value++ }, 250) })
onUnmounted(() => { if (tickInterval) clearInterval(tickInterval) })

const R = 15
const CIRCUM = 2 * Math.PI * R  // ≈ 94.25

function remaining(toast: ToastItem): number {
  void _tick.value  // reactive dependency
  return Math.max(0, toast.undoMs - (Date.now() - toast.startedAt))
}

function fraction(toast: ToastItem): number {
  return remaining(toast) / toast.undoMs
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return '0s'
  const s = Math.ceil(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${String(r).padStart(2, '0')}`
}
</script>

<template>
  <Teleport to="body">
    <div
      class="pointer-events-none fixed bottom-6 right-6 z-[200] flex flex-col gap-3"
      aria-live="polite"
      aria-atomic="false"
      aria-label="Action notifications"
    >
      <TransitionGroup name="toast">
        <div
          v-for="toast in toasts"
          :key="toast.id"
          role="status"
          class="pointer-events-auto flex w-96 max-w-[calc(100vw-3rem)] items-center gap-3 rounded-2xl border border-ctp-surface1 bg-ctp-mantle px-4 py-3.5 shadow-2xl"
        >
          <!-- Countdown ring -->
          <div class="shrink-0">
            <svg
              :width="36"
              :height="36"
              viewBox="0 0 36 36"
              aria-hidden="true"
              overflow="visible"
            >
              <!-- Track -->
              <circle
                cx="18"
                cy="18"
                :r="R"
                fill="none"
                stroke-width="3"
                style="stroke: var(--color-ctp-surface1)"
              />
              <!-- Draining indicator -->
              <circle
                cx="18"
                cy="18"
                :r="R"
                fill="none"
                stroke-width="3"
                stroke-linecap="round"
                :stroke-dasharray="CIRCUM"
                :stroke-dashoffset="CIRCUM * (1 - fraction(toast))"
                style="
                  stroke: var(--color-ctp-mauve);
                  transform: rotate(-90deg);
                  transform-origin: 18px 18px;
                  transition: stroke-dashoffset 0.25s linear;
                "
              />
              <!-- Countdown text -->
              <text
                x="18"
                y="18"
                text-anchor="middle"
                dominant-baseline="central"
                :font-size="remaining(toast) >= 60_000 ? 5 : 6.5"
                font-family="ui-monospace, monospace"
                style="fill: var(--color-ctp-subtext0)"
              >
                {{ formatRemaining(remaining(toast)) }}
              </text>
            </svg>
          </div>

          <!-- Message -->
          <div class="min-w-0 flex-1">
            <p class="text-sm font-semibold text-ctp-text">{{ toast.message }}</p>
            <p v-if="toast.submessage" class="mt-0.5 truncate text-xs text-ctp-subtext0">
              {{ toast.submessage }}
            </p>
          </div>

          <!-- Actions -->
          <div class="flex shrink-0 items-center gap-2">
            <button
              class="rounded-lg bg-ctp-mauve px-3.5 py-1.5 text-sm font-semibold text-ctp-base transition-opacity hover:opacity-90 active:scale-95"
              @click="undo(toast.id)"
            >
              {{ toast.undoLabel }}
            </button>
            <!-- ✕ only on undo-type toasts; deferred toasts commit on dismiss so we omit it -->
            <button
              v-if="toast.type === 'undo'"
              class="flex h-7 w-7 items-center justify-center rounded-lg text-ctp-subtext0 transition-colors hover:bg-ctp-surface0 hover:text-ctp-text"
              aria-label="Dismiss"
              @click="dismiss(toast.id)"
            >
              <svg class="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <path d="M2.146 2.854a.5.5 0 11.708-.708L8 7.293l5.146-5.147a.5.5 0 01.708.708L8.707 8l5.147 5.146a.5.5 0 01-.708.708L8 8.707l-5.146 5.147a.5.5 0 01-.708-.708L7.293 8 2.146 2.854z"/>
              </svg>
            </button>
          </div>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-enter-active {
  transition: all 280ms cubic-bezier(0.34, 1.56, 0.64, 1);
}
.toast-leave-active {
  transition: all 200ms ease;
}
.toast-enter-from {
  opacity: 0;
  transform: translateY(16px) scale(0.95);
}
.toast-leave-to {
  opacity: 0;
  transform: translateY(8px) scale(0.97);
}
</style>

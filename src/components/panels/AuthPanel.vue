<script setup lang="ts">
import { computed } from 'vue'
import type { AuthData, SignalAction } from '@/types/server'
import { useCountdown } from '@/composables/useCountdown'
import { useClipboard } from '@/composables/useClipboard'

const props = defineProps<{ data: AuthData; actions: SignalAction[]; receivedAt: string; compact?: boolean }>()

const action = computed(() => props.actions[0] ?? (props.data.actionUrl ? { url: props.data.actionUrl, text: null } : null))

const authTypeLabel: Record<AuthData['authType'], string> = {
  two_factor: 'Two-factor code',
  password_reset: 'Password reset link',
  verification: 'Verification link',
  security_alert: 'Security alert',
  other: 'Authentication email',
}

const actionLabel: Record<AuthData['authType'], string> = {
  two_factor: 'Open link',
  password_reset: 'Reset password',
  verification: 'Verify email',
  security_alert: 'View alert',
  other: 'Open link',
}

// `verification` covers both one-time codes and click-to-verify links, so the
// label follows whichever the signal actually carries.
const typeLabel = computed(() =>
  props.data.authType === 'verification' && props.data.code
    ? 'One-time code'
    : authTypeLabel[props.data.authType],
)

const expiresAt = computed(() => {
  if (!props.data.expiresInMinutes) return null
  const base = new Date(props.receivedAt)
  return new Date(base.getTime() + parseFloat(props.data.expiresInMinutes) * 60_000)
})

const countdown = useCountdown(expiresAt.value)

const formattedCode = computed(() => {
  const code = props.data.code
  if (!code) return null
  if (code.length === 6) return `${code.slice(0, 3)} ${code.slice(3)}`
  return code
})

const urgencyClass = computed(() => {
  switch (countdown.value.urgencyLevel) {
    case 'safe':
      return 'text-ctp-green'
    case 'warning':
      return 'text-ctp-peach'
    case 'critical':
      return 'text-ctp-red animate-pulse'
    default:
      return 'text-ctp-subtext0'
  }
})

const { copied, copy } = useClipboard()

function copyCode() {
  if (props.data.code) copy(props.data.code)
}
</script>

<template>
  <!-- Compact: single row for inbox thread list -->
  <div v-if="compact" class="flex items-center gap-2 text-xs">
    <span class="shrink-0 text-ctp-subtext0">🔑</span>
    <span class="shrink-0 font-medium text-ctp-text">{{ data.service }}</span>
    <code v-if="formattedCode" class="shrink-0 rounded bg-ctp-surface1 px-1.5 py-0.5 font-mono text-xs tracking-wider text-ctp-text">{{ formattedCode }}</code>
    <button
      v-if="data.code"
      class="shrink-0 rounded border border-ctp-surface1 px-1.5 py-0.5 text-xs text-ctp-subtext1 hover:bg-ctp-surface1"
      @click.prevent="copyCode"
    >
      {{ copied ? '✓' : 'Copy' }}
    </button>
    <a
      v-if="action && !data.code"
      :href="action.url"
      target="_blank"
      rel="noopener noreferrer"
      class="shrink-0 rounded bg-ctp-blue px-2 py-0.5 text-xs font-medium text-ctp-base hover:opacity-90"
      @click.stop
    >
      {{ action.text ?? actionLabel[data.authType] }}
    </a>
    <span v-if="countdown.display" class="ml-auto shrink-0" :class="urgencyClass">{{ countdown.display }}</span>
  </div>

  <!-- Full: detail view card -->
  <div v-else class="rounded-lg border border-ctp-surface1 bg-ctp-mantle p-4">
    <div class="mb-3 flex items-center gap-2">
      <span class="text-sm font-semibold text-ctp-text">{{ data.service }}</span>
      <span class="text-xs text-ctp-subtext0">{{ typeLabel }}</span>
    </div>

    <!-- Code display -->
    <div v-if="formattedCode" class="mb-3 flex items-center gap-3">
      <code
        class="rounded bg-ctp-surface1 px-3 py-1.5 font-mono text-xl tracking-widest text-ctp-text"
      >
        {{ formattedCode }}
      </code>
      <button
        class="rounded border border-ctp-surface1 px-2 py-1 text-xs text-ctp-subtext1 transition-colors hover:bg-ctp-surface1"
        @click="copyCode"
      >
        {{ copied ? 'Copied!' : 'Copy' }}
      </button>
    </div>

    <!-- Primary CTA (when no code) -->
    <div v-if="action && !data.code" class="mb-3">
      <a
        :href="action.url"
        target="_blank"
        rel="noopener noreferrer"
        class="inline-block rounded bg-ctp-blue px-4 py-2 text-sm font-medium text-ctp-base transition-opacity hover:opacity-90"
      >
        {{ action.text ?? actionLabel[data.authType] }}
      </a>
    </div>

    <!-- Secondary link (when code + action both present) -->
    <div v-if="action && data.code" class="mb-3">
      <a
        :href="action.url"
        target="_blank"
        rel="noopener noreferrer"
        class="text-xs text-ctp-subtext0 hover:text-ctp-text"
      >
        Or open link →
      </a>
    </div>

    <!-- Countdown -->
    <p v-if="countdown.display" class="text-xs" :class="urgencyClass">
      {{ countdown.display }}
    </p>
  </div>
</template>

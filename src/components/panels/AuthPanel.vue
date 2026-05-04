<script setup lang="ts">
import { computed } from 'vue'
import type { AuthData } from '@/types/server'
import { useCountdown } from '@/composables/useCountdown'
import { useClipboard } from '@/composables/useClipboard'

const props = defineProps<{ data: AuthData; receivedAt: string }>()

const authTypeLabel: Record<AuthData['authType'], string> = {
  otp: 'One-time code',
  two_factor: 'Two-factor code',
  password_reset: 'Password reset link',
  magic_link: 'Magic link',
  verification: 'Verification link',
  other: 'Authentication email',
}

const actionLabel: Record<AuthData['authType'], string> = {
  otp: 'Open link',
  two_factor: 'Open link',
  password_reset: 'Reset password',
  magic_link: 'Open link',
  verification: 'Verify email',
  other: 'Open link',
}

const expiresAt = computed(() => {
  if (!props.data.expiresInMinutes) return null
  const base = new Date(props.receivedAt)
  return new Date(base.getTime() + props.data.expiresInMinutes * 60_000)
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
  <div class="rounded-lg border border-ctp-surface1 bg-ctp-mantle p-4">
    <div class="mb-3 flex items-center gap-2">
      <span class="text-sm font-semibold text-ctp-text">{{ data.service }}</span>
      <span class="text-xs text-ctp-subtext0">{{ authTypeLabel[data.authType] }}</span>
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

    <!-- Action URL (when no code) -->
    <div v-if="data.actionUrl && !data.code" class="mb-3">
      <a
        :href="data.actionUrl"
        target="_blank"
        rel="noopener noreferrer"
        class="inline-block rounded bg-ctp-blue px-4 py-2 text-sm font-medium text-ctp-base transition-opacity hover:opacity-90"
      >
        {{ actionLabel[data.authType] }}
      </a>
    </div>

    <!-- Secondary action URL (when code + URL both present) -->
    <div v-if="data.actionUrl && data.code" class="mb-3">
      <a
        :href="data.actionUrl"
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

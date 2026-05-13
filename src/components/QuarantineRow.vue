<script setup lang="ts">
import { computed, inject } from 'vue'
import type { Signal } from '@/types/server'
import { NOW_KEY } from '@/composables/useRelativeTime'
import { formatRelativeTime } from '@/composables/useFormattedTime'

const props = defineProps<{
  signal: Signal
  pending: boolean
}>()

const emit = defineEmits<{
  (e: 'allow', signalId: string): void
  (e: 'block', signalId: string): void
}>()

const now = inject(NOW_KEY)
const timestamp = computed(() =>
  now ? formatRelativeTime(props.signal.receivedAt, now.value) : '',
)

const isUntrustedSender = computed(
  () =>
    props.signal.matchedRules?.some((r) => r.labels.includes('system:sender:untrusted')) ?? false,
)
const matchedRules = computed(() => props.signal.matchedRules ?? [])
</script>

<template>
  <div
    class="border-b border-ctp-surface0 transition-colors hover:bg-ctp-surface0"
    :class="{ 'opacity-50': pending }"
    role="listitem"
  >
    <div class="flex items-start gap-3 px-4 py-3">
      <!-- Quarantine reason badge -->
      <div class="mt-0.5 shrink-0">
        <span
          v-if="isUntrustedSender"
          class="inline-block rounded-full bg-ctp-peach/15 px-2 py-0.5 text-xs font-medium text-ctp-peach"
        >
          Untrusted sender
        </span>
        <span
          v-else-if="matchedRules.length"
          class="inline-block rounded-full bg-ctp-mauve/15 px-2 py-0.5 text-xs font-medium text-ctp-mauve"
        >
          Rule matched
        </span>
        <span
          v-else
          class="inline-block rounded-full bg-ctp-surface1 px-2 py-0.5 text-xs text-ctp-subtext0"
        >
          Quarantined
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

        <!-- Matched rule IDs -->
        <div v-if="matchedRules.length" class="mt-1 flex flex-wrap gap-1">
          <span
            v-for="rule in matchedRules"
            :key="rule.ruleId"
            class="inline-block rounded bg-ctp-surface1 px-1.5 py-0.5 font-mono text-xs text-ctp-subtext0"
          >
            {{ rule.ruleId }}
          </span>
        </div>

        <!-- Branch A: untrusted sender — allow or block directly -->
        <div v-if="isUntrustedSender" class="mt-2 flex items-center gap-2">
          <button
            class="rounded bg-ctp-green/15 px-3 py-1 text-xs font-medium text-ctp-green transition-colors hover:bg-ctp-green/25 disabled:opacity-50"
            :disabled="pending"
            @click="emit('allow', signal.id)"
          >
            Allow
          </button>
          <button
            class="rounded bg-ctp-red/15 px-3 py-1 text-xs font-medium text-ctp-red transition-colors hover:bg-ctp-red/25 disabled:opacity-50"
            :disabled="pending"
            @click="emit('block', signal.id)"
          >
            Block
          </button>
        </div>

        <!-- Branch B: rule matched — open rule editor to create/edit -->
        <div v-else-if="matchedRules.length" class="mt-2 flex flex-wrap items-center gap-2">
          <router-link
            :to="`/rules/new?signalId=${signal.id}&action=allow`"
            class="rounded bg-ctp-green/15 px-3 py-1 text-xs font-medium text-ctp-green transition-colors hover:bg-ctp-green/25"
          >
            Create rule to allow
          </router-link>
          <router-link
            :to="`/rules/new?signalId=${signal.id}&action=block`"
            class="rounded bg-ctp-red/15 px-3 py-1 text-xs font-medium text-ctp-red transition-colors hover:bg-ctp-red/25"
          >
            Create rule to block
          </router-link>
          <router-link
            v-if="matchedRules[0]"
            :to="`/rules/${matchedRules[0].ruleId}?signalId=${signal.id}`"
            class="rounded border border-ctp-surface1 px-3 py-1 text-xs text-ctp-subtext0 transition-colors hover:text-ctp-text"
          >
            Edit rule
          </router-link>
          <router-link to="/rules" class="text-xs text-ctp-blue hover:underline">
            View all rules
          </router-link>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import type {
  InvalidRuleFunctionSignal,
  InvalidTemplateFunctionSignal,
  AutoSendBlockedSignal,
  DomainMisconfigurationSignal,
  CalendarInviteInvalidSignal,
} from '@/types/server'

type SystemSignal =
  | InvalidRuleFunctionSignal
  | InvalidTemplateFunctionSignal
  | AutoSendBlockedSignal
  | DomainMisconfigurationSignal
  | CalendarInviteInvalidSignal

const props = defineProps<{ signal: SystemSignal }>()

const title = computed(() => {
  switch (props.signal.type) {
    case 'invalid_rule_function': return 'Rule Function Error'
    case 'invalid_template_function': return 'Template Function Error'
    case 'auto_send_blocked': return 'Outbound Message Blocked'
    case 'domain_misconfiguration': return 'Domain Misconfiguration'
    case 'calendar_invite_invalid': return 'Invalid Calendar Invite'
  }
})

const severity = computed(() => {
  switch (props.signal.type) {
    case 'invalid_rule_function':
    case 'invalid_template_function':
      return 'error'
    case 'auto_send_blocked':
    case 'domain_misconfiguration':
    case 'calendar_invite_invalid':
      return 'warning'
  }
})

const iconColor = computed(() => severity.value === 'error' ? 'text-ctp-red' : 'text-ctp-peach')
</script>

<template>
  <div class="rounded-lg border border-ctp-surface1 bg-ctp-mantle p-4">
    <div class="mb-2 flex items-center gap-2">
      <svg :class="['h-4 w-4', iconColor]" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
        <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 10.5a1 1 0 110-2 1 1 0 010 2zM8.75 4v4.5h-1.5V4h1.5z"/>
      </svg>
      <span class="text-sm font-medium text-ctp-text">{{ title }}</span>
      <span class="ml-auto text-xs text-ctp-subtext0">{{ new Date(signal.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) }}</span>
    </div>

    <!-- invalid_rule_function -->
    <template v-if="signal.type === 'invalid_rule_function'">
      <p class="text-sm text-ctp-subtext1">
        Rule <RouterLink :to="`/rules/${signal.data.resourceName}`" class="font-medium text-ctp-mauve hover:underline">{{ signal.data.resourceName }}</RouterLink> has an error:
      </p>
      <p class="mt-1 text-xs text-ctp-red">{{ signal.data.issue }}</p>
    </template>

    <!-- invalid_template_function -->
    <template v-else-if="signal.type === 'invalid_template_function'">
      <p class="text-sm text-ctp-subtext1">
        Template function <span class="font-medium text-ctp-text">{{ signal.data.functionName }}</span>
        in <RouterLink to="/templates" class="font-medium text-ctp-mauve hover:underline">{{ signal.data.resourceName }}</RouterLink> has an error:
      </p>
      <p class="mt-1 text-xs text-ctp-red">{{ signal.data.issue }}</p>
    </template>

    <!-- auto_send_blocked -->
    <template v-else-if="signal.type === 'auto_send_blocked'">
      <p class="text-sm text-ctp-subtext1">
        Outbound message to <span class="font-medium text-ctp-text">{{ signal.data.recipientAddress }}</span> was blocked.
      </p>
      <p v-if="signal.data.reason" class="mt-1 text-xs text-ctp-subtext0">{{ signal.data.reason }}</p>
    </template>

    <!-- domain_misconfiguration -->
    <template v-else-if="signal.type === 'domain_misconfiguration'">
      <p class="text-sm text-ctp-subtext1">
        Domain <span class="font-medium text-ctp-text">{{ signal.data.domain }}</span> is misconfigured
        for alias <span class="font-medium text-ctp-text">{{ signal.data.aliasAddress }}</span>.
      </p>
      <p class="mt-1 text-xs text-ctp-subtext0">{{ signal.data.reason }}</p>
    </template>

    <!-- calendar_invite_invalid -->
    <template v-else-if="signal.type === 'calendar_invite_invalid'">
      <p class="text-sm text-ctp-subtext1">
        A calendar invite could not be processed.
      </p>
      <p class="mt-1 text-xs text-ctp-subtext0">{{ signal.data.reason }}</p>
    </template>
  </div>
</template>

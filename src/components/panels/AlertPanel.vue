<script setup lang="ts">
import { computed } from 'vue'
import type { AlertData, SignalAction } from '@/types/server'

const props = defineProps<{ data: AlertData; actions: SignalAction[]; compact?: boolean }>()

const primaryAction = computed(() => (props.data.actionUrl ? { url: props.data.actionUrl, text: null } : null) ?? props.actions[0] ?? null)
const allActions = computed(() => {
  if (!props.data.actionUrl) return props.actions
  // actionUrl is rendered as primary — show remaining actions as secondary
  return props.actions.filter(a => a.url !== props.data.actionUrl)
})

const alertTypeLabel: Record<AlertData['alertType'], string> = {
  suspicious_login: 'Suspicious login detected',
  new_device: 'New device signed in',
  password_changed: 'Password changed',
  breach_notice: 'Security breach notice',
  api_key_exposed: 'API key exposure detected',
  account_locked: 'Account locked — action required',
  fraud_alert: 'Fraud alert — unusual activity',
  ci_failure: 'CI failed',
  deployment_failed: 'Deployment failed',
  error_spike: 'Error spike detected',
  domain_expiry: 'Domain expiring',
  cert_expiry: 'SSL certificate expiring',
  security_scan: 'Security scan result',
  other: 'Alert',
}

const isSecurity = (type: AlertData['alertType']) =>
  [
    'suspicious_login',
    'new_device',
    'fraud_alert',
    'api_key_exposed',
    'account_locked',
    'breach_notice',
    'password_changed',
  ].includes(type)

const isFraud = (type: AlertData['alertType']) => type === 'fraud_alert'

const severityClass = (severity?: AlertData['severity']) => {
  switch (severity) {
    case 'critical':
      return 'border-ctp-red bg-ctp-red/10'
    case 'warning':
      return 'border-ctp-peach bg-ctp-peach/10'
    default:
      return 'border-ctp-blue bg-ctp-blue/10'
  }
}
</script>

<template>
  <!-- Compact: single row for inbox thread list -->
  <div v-if="compact" class="flex items-center gap-2 text-xs">
    <span class="shrink-0 text-ctp-subtext0">⚠</span>
    <span class="shrink-0 font-medium" :class="data.severity === 'critical' ? 'text-ctp-red' : 'text-ctp-text'">{{ data.service }}</span>
    <span class="shrink-0 text-ctp-subtext0">{{ alertTypeLabel[data.alertType] }}</span>
    <span
      v-if="data.severity"
      class="shrink-0 rounded px-1 py-0.5 text-xs font-medium uppercase"
      :class="data.severity === 'critical' ? 'bg-ctp-red text-ctp-base' : data.severity === 'warning' ? 'bg-ctp-peach text-ctp-base' : 'bg-ctp-blue text-ctp-base'"
    >
      {{ data.severity }}
    </span>
    <a
      v-if="data.requiresAction && primaryAction"
      :href="primaryAction.url"
      target="_blank"
      rel="noopener noreferrer"
      class="ml-auto shrink-0 rounded bg-ctp-red px-2 py-0.5 text-xs font-medium text-ctp-base hover:opacity-90"
      @click.stop
    >
      {{ primaryAction.text ?? 'Investigate →' }}
    </a>
  </div>

  <!-- Full: detail view card -->
  <div
    v-else
    class="rounded-lg border p-4"
    :class="[
      isFraud(data.alertType) ? 'border-ctp-red bg-ctp-red/10' : severityClass(data.severity),
    ]"
  >
    <div class="mb-2 flex items-start justify-between gap-2">
      <div>
        <p
          class="text-sm font-semibold"
          :class="
            data.severity === 'critical' || isFraud(data.alertType)
              ? 'text-ctp-red'
              : 'text-ctp-text'
          "
        >
          {{ data.service }}
        </p>
        <p class="text-xs text-ctp-subtext0">{{ alertTypeLabel[data.alertType] }}</p>
      </div>
      <span
        v-if="data.severity"
        class="rounded px-1.5 py-0.5 text-xs font-medium uppercase"
        :class="
          data.severity === 'critical'
            ? 'bg-ctp-red text-ctp-base'
            : data.severity === 'warning'
              ? 'bg-ctp-peach text-ctp-base'
              : 'bg-ctp-blue text-ctp-base'
        "
      >
        {{ data.severity }}
      </span>
    </div>

    <!-- Security context -->
    <div
      v-if="isSecurity(data.alertType) && (data.location || data.ipAddress || data.deviceName)"
      class="mb-2 space-y-1"
    >
      <p v-if="data.deviceName" class="text-xs text-ctp-subtext0">Device: {{ data.deviceName }}</p>
      <p v-if="data.location || data.ipAddress" class="text-xs text-ctp-subtext0">
        {{ [data.location, data.ipAddress].filter(Boolean).join(' — ') }}
      </p>
    </div>

    <!-- Developer context -->
    <div v-if="data.repository" class="mb-2">
      <p class="text-xs font-mono text-ctp-subtext0">{{ data.repository }}</p>
      <p v-if="data.errorMessage" class="mt-1 truncate text-xs font-mono text-ctp-red">
        {{ data.errorMessage.slice(0, 120) }}
      </p>
    </div>

    <!-- Actions -->
    <div v-if="data.requiresAction && (primaryAction || allActions.length)" class="flex gap-2">
      <a
        v-if="primaryAction"
        :href="primaryAction.url"
        target="_blank"
        rel="noopener noreferrer"
        class="rounded bg-ctp-red px-3 py-1.5 text-xs font-medium text-ctp-base hover:opacity-90"
      >
        {{ primaryAction.text ?? 'Investigate →' }}
      </a>
      <a
        v-for="action in allActions"
        :key="action.url"
        :href="action.url"
        target="_blank"
        rel="noopener noreferrer"
        class="rounded bg-ctp-red px-3 py-1.5 text-xs font-medium text-ctp-base hover:opacity-90"
      >
        {{ action.text ?? 'Investigate →' }}
      </a>
    </div>
  </div>
</template>

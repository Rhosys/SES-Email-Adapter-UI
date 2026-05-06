<script setup lang="ts">
import type { AlertData } from '@/types/server'

defineProps<{ data: AlertData }>()

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
  <div
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
    <div class="flex gap-2">
      <a
        v-if="data.actionUrl && data.requiresAction"
        :href="data.actionUrl"
        target="_blank"
        rel="noopener noreferrer"
        class="rounded bg-ctp-red px-3 py-1.5 text-xs font-medium text-ctp-base hover:opacity-90"
      >
        Investigate →
      </a>
    </div>
  </div>
</template>

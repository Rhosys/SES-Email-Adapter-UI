<script setup lang="ts">
import { computed } from 'vue'
import type { HealthcareData } from '@/types/server'

const props = defineProps<{ data: HealthcareData }>()

const typeLabel: Record<HealthcareData['eventType'], string> = {
  appointment_reminder: 'Appointment reminder',
  appointment_confirmation: 'Appointment confirmation',
  test_results: 'Test results available',
  prescription: 'Prescription',
  insurance_update: 'Insurance update',
  billing: 'Medical bill',
  referral: 'Referral letter',
}

const appointmentLabel = computed(() => {
  if (!props.data.appointmentDate) return null
  const d = new Date(props.data.appointmentDate)
  const now = new Date()
  const diffMs = d.getTime() - now.getTime()
  const diffHours = diffMs / 3_600_000
  if (diffHours < 0) return { text: 'Yesterday', urgent: false }
  if (diffHours < 24) {
    return {
      text: `Today ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`,
      urgent: true,
    }
  }
  if (diffHours < 48) {
    return {
      text: `Tomorrow ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`,
      urgent: true,
    }
  }
  return {
    text: d.toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }),
    urgent: false,
  }
})
</script>

<template>
  <div class="rounded-lg border border-ctp-surface1 bg-ctp-mantle p-4">
    <div class="flex flex-wrap items-center gap-2">
      <span class="text-sm text-ctp-subtext1">{{ data.provider ?? 'Healthcare' }}</span>
      <span class="text-xs text-ctp-subtext0">{{ typeLabel[data.eventType] }}</span>
      <span
        v-if="data.requiresAction"
        class="rounded-full border border-ctp-peach px-2 py-0.5 text-xs text-ctp-peach"
      >
        Action needed
      </span>
    </div>

    <p
      v-if="appointmentLabel"
      class="mt-2 text-sm"
      :class="appointmentLabel.urgent ? 'font-medium text-ctp-peach' : 'text-ctp-subtext0'"
    >
      {{ appointmentLabel.text }}
    </p>

    <p v-if="data.location" class="mt-1 text-xs text-ctp-subtext0">📍 {{ data.location }}</p>

    <div v-if="data.portalUrl" class="mt-3">
      <a
        :href="data.portalUrl"
        target="_blank"
        rel="noopener noreferrer"
        class="text-xs text-ctp-blue hover:underline"
      >
        {{
          data.eventType === 'test_results'
            ? 'View results in patient portal →'
            : 'View in portal →'
        }}
      </a>
    </div>
  </div>
</template>

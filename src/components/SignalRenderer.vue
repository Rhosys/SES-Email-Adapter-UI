<script setup lang="ts">
import type { Signal } from '@/types/server'
import EmailSignalCard from '@/components/EmailSignalCard.vue'
import DeliverabilityCard from '@/components/DeliverabilityCard.vue'
import CalendarEventCard from '@/components/CalendarEventCard.vue'
import CalendarResponseCard from '@/components/CalendarResponseCard.vue'
import SystemAlertCard from '@/components/SystemAlertCard.vue'

defineProps<{ signal: Signal }>()
defineEmits<{ undo: [] }>()
</script>

<template>
  <EmailSignalCard v-if="signal.type === 'email'" :signal="signal" @undo="$emit('undo')" />
  <DeliverabilityCard v-else-if="signal.type === 'deliverability'" :signal="signal" />
  <CalendarEventCard v-else-if="signal.type === 'calendar_event'" :signal="signal" />
  <CalendarResponseCard v-else-if="signal.type === 'calendar_response'" :signal="signal" />
  <SystemAlertCard v-else :signal="signal" />
</template>

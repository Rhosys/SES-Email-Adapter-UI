<script setup lang="ts">
import type { Signal } from '@/types/server'
import EmailSignalCard from '@/components/EmailSignalCard.vue'
import DeliverabilityCard from '@/components/DeliverabilityCard.vue'
import CalendarEventCard from '@/components/CalendarEventCard.vue'
import CalendarResponseCard from '@/components/CalendarResponseCard.vue'
import SystemAlertCard from '@/components/SystemAlertCard.vue'

withDefaults(defineProps<{ signal: Signal; defaultExpanded?: boolean }>(), { defaultExpanded: true })
defineEmits<{ reply: []; reprocessed: [] }>()
</script>

<template>
  <EmailSignalCard v-if="signal.type === 'email'" :signal="signal" :default-expanded="defaultExpanded" @reply="$emit('reply')" @reprocessed="$emit('reprocessed')" />
  <DeliverabilityCard v-else-if="signal.type === 'deliverability'" :signal="signal" />
  <CalendarEventCard v-else-if="signal.type === 'calendar_event'" :signal="signal" />
  <CalendarResponseCard v-else-if="signal.type === 'calendar_response'" :signal="signal" />
  <SystemAlertCard v-else :signal="signal" />
</template>

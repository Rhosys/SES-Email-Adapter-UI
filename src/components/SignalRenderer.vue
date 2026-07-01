<script setup lang="ts">
import type { Signal } from '@/types/server'
import EmailSignalCard from '@/components/EmailSignalCard.vue'
import DeliverabilityCard from '@/components/DeliverabilityCard.vue'
import CalendarEventCard from '@/components/CalendarEventCard.vue'
import CalendarResponseCard from '@/components/CalendarResponseCard.vue'
import SystemAlertCard from '@/components/SystemAlertCard.vue'

withDefaults(defineProps<{ signal: Signal; linkedSignal?: Signal; defaultExpanded?: boolean }>(), { linkedSignal: undefined, defaultExpanded: true })
defineEmits<{ undo: []; reply: []; reprocessed: [] }>()
</script>

<template>
  <EmailSignalCard v-if="signal.type === 'email'" :signal="signal" :default-expanded="defaultExpanded" @undo="$emit('undo')" @reply="$emit('reply')" @reprocessed="$emit('reprocessed')" />
  <DeliverabilityCard v-else-if="signal.type === 'deliverability'" :signal="signal" :linked-signal="linkedSignal" />
  <CalendarEventCard v-else-if="signal.type === 'calendar_event'" :signal="signal" :linked-signal="linkedSignal" />
  <CalendarResponseCard v-else-if="signal.type === 'calendar_response'" :signal="signal" :linked-signal="linkedSignal" />
  <SystemAlertCard v-else :signal="signal" :linked-signal="linkedSignal" />
</template>

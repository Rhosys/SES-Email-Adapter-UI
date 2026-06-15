<script setup lang="ts">
import type { Signal } from '@/types/server'
import EmailSignalCard from '@/components/EmailSignalCard.vue'
import DeliverabilityCard from '@/components/DeliverabilityCard.vue'
import CalendarEventCard from '@/components/CalendarEventCard.vue'
import CalendarResponseCard from '@/components/CalendarResponseCard.vue'
import SystemAlertCard from '@/components/SystemAlertCard.vue'

defineProps<{ signal: Signal; duplicates?: Signal[]; linkedSignal?: Signal }>()
defineEmits<{ undo: []; reply: [] }>()
</script>

<template>
  <EmailSignalCard v-if="signal.type === 'email'" :signal="signal" :duplicates="duplicates ?? []" @undo="$emit('undo')" @reply="$emit('reply')" />
  <DeliverabilityCard v-else-if="signal.type === 'deliverability'" :signal="signal" :linked-signal="linkedSignal" />
  <CalendarEventCard v-else-if="signal.type === 'calendar_event'" :signal="signal" :linked-signal="linkedSignal" />
  <CalendarResponseCard v-else-if="signal.type === 'calendar_response'" :signal="signal" :linked-signal="linkedSignal" />
  <SystemAlertCard v-else :signal="signal" :linked-signal="linkedSignal" />
</template>

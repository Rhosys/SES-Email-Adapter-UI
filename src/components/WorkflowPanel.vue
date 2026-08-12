<script setup lang="ts">
import { computed } from 'vue'
import type { Signal, SignalAction, Workflow, WorkflowData } from '@/types/server'
import type { WorkflowGroup } from '@/lib/workflow-aggregator'
import { isInboundEmailSignal } from '@/lib/signal-guards'
import AuthPanel from './panels/AuthPanel.vue'
import ConversationPanel from './panels/ConversationPanel.vue'
import CrmPanel from './panels/CrmPanel.vue'
import PackagePanel from './panels/PackagePanel.vue'
import TravelPanel from './panels/TravelPanel.vue'
import PaymentsPanel from './panels/PaymentsPanel.vue'
import AlertPanel from './panels/AlertPanel.vue'
import ContentPanel from './panels/ContentPanel.vue'
import StatusPanel from './panels/StatusPanel.vue'
import HealthcarePanel from './panels/HealthcarePanel.vue'
import JobPanel from './panels/JobPanel.vue'
import SupportPanel from './panels/SupportPanel.vue'
import TestPanel from './panels/TestPanel.vue'
import EventsPanel from './panels/EventsPanel.vue'

function narrowWorkflowData<W extends Workflow>(_workflow: W, data: WorkflowData): Extract<WorkflowData, { workflow: W }> {
  return data as Extract<WorkflowData, { workflow: W }>
}

const props = withDefaults(defineProps<{
  signal?: Signal
  workflowGroup?: WorkflowGroup
  data?: WorkflowData
  actions?: SignalAction[]
  compact?: boolean
}>(), {
  actions: () => [],
  compact: false,
})

const inboundData = computed(() => props.signal && isInboundEmailSignal(props.signal) ? props.signal.data : null)
const receivedAt = computed(() => inboundData.value?.receivedAt ?? '')

const resolvedGroup = computed((): { workflow: Workflow; entries: WorkflowData[] } | null => {
  if (props.workflowGroup) return props.workflowGroup
  if (props.data) return { workflow: props.data.workflow, entries: [props.data] }
  if (!inboundData.value?.workflowData) return null
  return { workflow: inboundData.value.workflow, entries: [inboundData.value.workflowData] }
})

const entryActions = computed((): SignalAction[] => {
  if (props.actions.length > 0) return props.actions
  if (inboundData.value?.actions) return inboundData.value.actions
  return []
})

function actionsForEntry(idx: number): SignalAction[] {
  return idx === 0 ? entryActions.value : []
}

function isAuthVisible(entry: WorkflowData, idx: number): boolean {
  if (entry.workflow !== 'auth') return false
  const auth = narrowWorkflowData('auth', entry)
  return !!(auth.code || actionsForEntry(idx).length > 0)
}
</script>

<template>
  <div v-if="resolvedGroup && resolvedGroup.entries.length > 1" class="rounded-lg border border-ctp-surface1 bg-ctp-mantle">
    <template v-for="(entry, idx) in resolvedGroup.entries" :key="idx">
      <AuthPanel v-if="isAuthVisible(entry, idx)" :data="narrowWorkflowData('auth', entry)" :actions="actionsForEntry(idx)" :received-at="receivedAt" :compact="compact" />
      <ConversationPanel v-else-if="entry.workflow === 'conversation'" :data="narrowWorkflowData('conversation', entry)" :compact="compact" />
      <CrmPanel v-else-if="entry.workflow === 'crm'" :data="narrowWorkflowData('crm', entry)" :compact="compact" />
      <PackagePanel v-else-if="entry.workflow === 'package'" :data="narrowWorkflowData('package', entry)" :compact="compact" />
      <TravelPanel v-else-if="entry.workflow === 'travel'" :data="narrowWorkflowData('travel', entry)" :compact="compact" />
      <PaymentsPanel v-else-if="entry.workflow === 'payments'" :data="narrowWorkflowData('payments', entry)" :compact="compact" />
      <AlertPanel v-else-if="entry.workflow === 'alert'" :data="narrowWorkflowData('alert', entry)" :actions="actionsForEntry(idx)" :compact="compact" />
      <ContentPanel v-else-if="entry.workflow === 'content'" :data="narrowWorkflowData('content', entry)" :compact="compact" />
      <StatusPanel v-else-if="entry.workflow === 'status'" :data="narrowWorkflowData('status', entry)" :compact="compact" />
      <HealthcarePanel v-else-if="entry.workflow === 'healthcare'" :data="narrowWorkflowData('healthcare', entry)" :compact="compact" />
      <JobPanel v-else-if="entry.workflow === 'job'" :data="narrowWorkflowData('job', entry)" :actions="actionsForEntry(idx)" :compact="compact" />
      <SupportPanel v-else-if="entry.workflow === 'support'" :data="narrowWorkflowData('support', entry)" :compact="compact" />
      <EventsPanel v-else-if="entry.workflow === 'events'" :data="narrowWorkflowData('events', entry)" />
      <TestPanel v-else-if="entry.workflow === 'test'" :data="narrowWorkflowData('test', entry)" :compact="compact" />
      <hr v-if="idx < resolvedGroup.entries.length - 1" class="border-ctp-surface0" />
    </template>
  </div>
  <template v-else-if="resolvedGroup && resolvedGroup.entries.length === 1">
    <AuthPanel v-if="isAuthVisible(resolvedGroup.entries[0], 0)" :data="narrowWorkflowData('auth', resolvedGroup.entries[0])" :actions="entryActions" :received-at="receivedAt" :compact="compact" />
    <ConversationPanel v-else-if="resolvedGroup.entries[0].workflow === 'conversation'" :data="narrowWorkflowData('conversation', resolvedGroup.entries[0])" :compact="compact" />
    <CrmPanel v-else-if="resolvedGroup.entries[0].workflow === 'crm'" :data="narrowWorkflowData('crm', resolvedGroup.entries[0])" :compact="compact" />
    <PackagePanel v-else-if="resolvedGroup.entries[0].workflow === 'package'" :data="narrowWorkflowData('package', resolvedGroup.entries[0])" :compact="compact" />
    <TravelPanel v-else-if="resolvedGroup.entries[0].workflow === 'travel'" :data="narrowWorkflowData('travel', resolvedGroup.entries[0])" :compact="compact" />
    <PaymentsPanel v-else-if="resolvedGroup.entries[0].workflow === 'payments'" :data="narrowWorkflowData('payments', resolvedGroup.entries[0])" :compact="compact" />
    <AlertPanel v-else-if="resolvedGroup.entries[0].workflow === 'alert'" :data="narrowWorkflowData('alert', resolvedGroup.entries[0])" :actions="entryActions" :compact="compact" />
    <ContentPanel v-else-if="resolvedGroup.entries[0].workflow === 'content'" :data="narrowWorkflowData('content', resolvedGroup.entries[0])" :compact="compact" />
    <StatusPanel v-else-if="resolvedGroup.entries[0].workflow === 'status'" :data="narrowWorkflowData('status', resolvedGroup.entries[0])" :compact="compact" />
    <HealthcarePanel v-else-if="resolvedGroup.entries[0].workflow === 'healthcare'" :data="narrowWorkflowData('healthcare', resolvedGroup.entries[0])" :compact="compact" />
    <JobPanel v-else-if="resolvedGroup.entries[0].workflow === 'job'" :data="narrowWorkflowData('job', resolvedGroup.entries[0])" :actions="entryActions" :compact="compact" />
    <SupportPanel v-else-if="resolvedGroup.entries[0].workflow === 'support'" :data="narrowWorkflowData('support', resolvedGroup.entries[0])" :compact="compact" />
    <EventsPanel v-else-if="resolvedGroup.entries[0].workflow === 'events'" :data="narrowWorkflowData('events', resolvedGroup.entries[0])" />
    <TestPanel v-else-if="resolvedGroup.entries[0].workflow === 'test'" :data="narrowWorkflowData('test', resolvedGroup.entries[0])" :compact="compact" />
  </template>
</template>

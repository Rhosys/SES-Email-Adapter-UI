<script setup lang="ts">
import { computed } from 'vue'
import type { Signal, SignalAction, Workflow, WorkflowData, WorkflowDataMap } from '@/types/server'
import type { WorkflowGroup } from '@/lib/workflow-aggregator'
import { isInboundEmailSignal } from '@/lib/signal-guards'
import { isWorkflowEntryVisible } from '@/lib/workflow-visibility'
import AsyncButton from './ui/AsyncButton.vue'
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

// The `_workflow` value never appears in `data` itself (workflowData carries no
// discriminant of its own) — it only pins the generic so the return type narrows.
function narrowWorkflowData<W extends keyof WorkflowDataMap>(_workflow: W, data: WorkflowData): WorkflowDataMap[W] {
  return data as WorkflowDataMap[W]
}

const props = withDefaults(defineProps<{
  signal?: Signal
  workflowGroup?: WorkflowGroup
  actions?: SignalAction[]
  compact?: boolean
  unsubscribeAction?: () => Promise<unknown>
}>(), {
  signal: undefined,
  workflowGroup: undefined,
  actions: () => [],
  compact: false,
  unsubscribeAction: undefined,
})

const inboundData = computed(() => props.signal && isInboundEmailSignal(props.signal) ? props.signal.data : null)
const receivedAt = computed(() => inboundData.value?.receivedAt ?? '')

const resolvedGroup = computed((): { workflow: Workflow; entries: WorkflowData[] } | null => {
  if (props.workflowGroup) return props.workflowGroup
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

const visibleEntries = computed((): { entry: WorkflowData; idx: number }[] => {
  if (!resolvedGroup.value) return []
  const { workflow, entries } = resolvedGroup.value
  return entries
    .map((entry, idx) => ({ entry, idx }))
    .filter(({ entry, idx }) => isWorkflowEntryVisible(workflow, entry, actionsForEntry(idx).length > 0))
})

const showUnsubscribeFooter = computed(() =>
  !!props.unsubscribeAction && !props.compact && visibleEntries.value.length > 0,
)
</script>

<template>
  <div v-if="visibleEntries.length > 0">
    <div v-if="visibleEntries.length > 1" class="rounded-lg border border-ctp-surface1 bg-ctp-mantle">
      <template v-for="({ entry, idx }, i) in visibleEntries" :key="idx">
        <AuthPanel v-if="resolvedGroup!.workflow === 'auth'" :data="narrowWorkflowData('auth', entry)" :actions="actionsForEntry(idx)" :received-at="receivedAt" :compact="compact" />
        <ConversationPanel v-else-if="resolvedGroup!.workflow === 'conversation'" :data="narrowWorkflowData('conversation', entry)" :compact="compact" />
        <CrmPanel v-else-if="resolvedGroup!.workflow === 'crm'" :data="narrowWorkflowData('crm', entry)" :compact="compact" />
        <PackagePanel v-else-if="resolvedGroup!.workflow === 'package'" :data="narrowWorkflowData('package', entry)" :compact="compact" />
        <TravelPanel v-else-if="resolvedGroup!.workflow === 'travel'" :data="narrowWorkflowData('travel', entry)" :compact="compact" />
        <PaymentsPanel v-else-if="resolvedGroup!.workflow === 'payments'" :data="narrowWorkflowData('payments', entry)" :compact="compact" />
        <AlertPanel v-else-if="resolvedGroup!.workflow === 'alert'" :data="narrowWorkflowData('alert', entry)" :actions="actionsForEntry(idx)" :compact="compact" />
        <ContentPanel v-else-if="resolvedGroup!.workflow === 'content'" :data="narrowWorkflowData('content', entry)" :compact="compact" />
        <StatusPanel v-else-if="resolvedGroup!.workflow === 'status'" :data="narrowWorkflowData('status', entry)" :compact="compact" />
        <HealthcarePanel v-else-if="resolvedGroup!.workflow === 'healthcare'" :data="narrowWorkflowData('healthcare', entry)" :compact="compact" />
        <JobPanel v-else-if="resolvedGroup!.workflow === 'job'" :data="narrowWorkflowData('job', entry)" :actions="actionsForEntry(idx)" :compact="compact" />
        <SupportPanel v-else-if="resolvedGroup!.workflow === 'support'" :data="narrowWorkflowData('support', entry)" :compact="compact" />
        <EventsPanel v-else-if="resolvedGroup!.workflow === 'events'" :data="narrowWorkflowData('events', entry)" />
        <TestPanel v-else-if="resolvedGroup!.workflow === 'test'" :data="narrowWorkflowData('test', entry)" :compact="compact" />
        <hr v-if="i < visibleEntries.length - 1" class="border-ctp-surface0" />
      </template>
    </div>
    <template v-else>
      <AuthPanel v-if="resolvedGroup!.workflow === 'auth'" :data="narrowWorkflowData('auth', visibleEntries[0].entry)" :actions="entryActions" :received-at="receivedAt" :compact="compact" />
      <ConversationPanel v-else-if="resolvedGroup!.workflow === 'conversation'" :data="narrowWorkflowData('conversation', visibleEntries[0].entry)" :compact="compact" />
      <CrmPanel v-else-if="resolvedGroup!.workflow === 'crm'" :data="narrowWorkflowData('crm', visibleEntries[0].entry)" :compact="compact" />
      <PackagePanel v-else-if="resolvedGroup!.workflow === 'package'" :data="narrowWorkflowData('package', visibleEntries[0].entry)" :compact="compact" />
      <TravelPanel v-else-if="resolvedGroup!.workflow === 'travel'" :data="narrowWorkflowData('travel', visibleEntries[0].entry)" :compact="compact" />
      <PaymentsPanel v-else-if="resolvedGroup!.workflow === 'payments'" :data="narrowWorkflowData('payments', visibleEntries[0].entry)" :compact="compact" />
      <AlertPanel v-else-if="resolvedGroup!.workflow === 'alert'" :data="narrowWorkflowData('alert', visibleEntries[0].entry)" :actions="entryActions" :compact="compact" />
      <ContentPanel v-else-if="resolvedGroup!.workflow === 'content'" :data="narrowWorkflowData('content', visibleEntries[0].entry)" :compact="compact" />
      <StatusPanel v-else-if="resolvedGroup!.workflow === 'status'" :data="narrowWorkflowData('status', visibleEntries[0].entry)" :compact="compact" />
      <HealthcarePanel v-else-if="resolvedGroup!.workflow === 'healthcare'" :data="narrowWorkflowData('healthcare', visibleEntries[0].entry)" :compact="compact" />
      <JobPanel v-else-if="resolvedGroup!.workflow === 'job'" :data="narrowWorkflowData('job', visibleEntries[0].entry)" :actions="entryActions" :compact="compact" />
      <SupportPanel v-else-if="resolvedGroup!.workflow === 'support'" :data="narrowWorkflowData('support', visibleEntries[0].entry)" :compact="compact" />
      <EventsPanel v-else-if="resolvedGroup!.workflow === 'events'" :data="narrowWorkflowData('events', visibleEntries[0].entry)" />
      <TestPanel v-else-if="resolvedGroup!.workflow === 'test'" :data="narrowWorkflowData('test', visibleEntries[0].entry)" :compact="compact" />
    </template>
    <!-- Attached to the panel above via a top divider rather than its own bordered
         box, so it reads as part of that panel instead of a second, separate one. -->
    <div v-if="showUnsubscribeFooter" class="mt-2 flex items-center justify-between gap-3 border-t border-ctp-surface1 px-1 pt-2">
      <span class="text-xs text-ctp-subtext0">Don't want emails like this?</span>
      <AsyncButton
        :action="unsubscribeAction!"
        class="flex h-7 items-center gap-1.5 rounded border border-ctp-surface1 px-2.5 text-xs text-ctp-subtext1 hover:border-ctp-peach hover:text-ctp-peach"
      >
        <svg class="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M8 1a7 7 0 100 14A7 7 0 008 1zM4.5 7.5h7v1h-7v-1z"/>
        </svg>
        Unsubscribe
      </AsyncButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { Signal, SignalAction, Workflow, WorkflowData } from '@/types/server'
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

function narrowWorkflowData<W extends Workflow>(_workflow: W, data: WorkflowData): Extract<WorkflowData, { workflow: W }> {
  return data as Extract<WorkflowData, { workflow: W }>
}

const props = withDefaults(defineProps<{ signal: Signal; actions?: SignalAction[]; compact?: boolean }>(), {
  actions: () => [],
  compact: false,
})

const inboundData = computed(() => isInboundEmailSignal(props.signal) ? props.signal.data : null)
const workflow = computed(() => inboundData.value?.workflow ?? null)
const data = computed(() => inboundData.value?.workflowData ?? null)
const receivedAt = computed(() => inboundData.value?.receivedAt ?? '')
const resolvedActions = computed(() => props.actions.length > 0 ? props.actions : (inboundData.value?.actions ?? []))

const authData = computed(() => workflow.value === 'auth' && data.value ? narrowWorkflowData('auth', data.value) : null)
const authVisible = computed(() => {
  if (!authData.value) return false
  return !!(authData.value.code || resolvedActions.value.length > 0)
})
const conversationData = computed(() => workflow.value === 'conversation' && data.value ? narrowWorkflowData('conversation', data.value) : null)
const crmData = computed(() => workflow.value === 'crm' && data.value ? narrowWorkflowData('crm', data.value) : null)
const packageData = computed(() => workflow.value === 'package' && data.value ? narrowWorkflowData('package', data.value) : null)
const travelData = computed(() => workflow.value === 'travel' && data.value ? narrowWorkflowData('travel', data.value) : null)
const paymentsData = computed(() => workflow.value === 'payments' && data.value ? narrowWorkflowData('payments', data.value) : null)
const alertData = computed(() => workflow.value === 'alert' && data.value ? narrowWorkflowData('alert', data.value) : null)
const contentData = computed(() => workflow.value === 'content' && data.value ? narrowWorkflowData('content', data.value) : null)
const statusData = computed(() => workflow.value === 'status' && data.value ? narrowWorkflowData('status', data.value) : null)
const healthcareData = computed(() => workflow.value === 'healthcare' && data.value ? narrowWorkflowData('healthcare', data.value) : null)
const jobData = computed(() => workflow.value === 'job' && data.value ? narrowWorkflowData('job', data.value) : null)
const supportData = computed(() => workflow.value === 'support' && data.value ? narrowWorkflowData('support', data.value) : null)
const testData = computed(() => workflow.value === 'test' && data.value ? narrowWorkflowData('test', data.value) : null)
</script>

<template>
  <AuthPanel v-if="authVisible" :data="authData!" :actions="resolvedActions" :received-at="receivedAt" :compact="compact" />
  <ConversationPanel v-else-if="conversationData" :data="conversationData" :compact="compact" />
  <CrmPanel v-else-if="crmData" :data="crmData" :compact="compact" />
  <PackagePanel v-else-if="packageData" :data="packageData" :compact="compact" />
  <TravelPanel v-else-if="travelData" :data="travelData" :compact="compact" />
  <PaymentsPanel v-else-if="paymentsData" :data="paymentsData" :compact="compact" />
  <AlertPanel v-else-if="alertData" :data="alertData" :actions="resolvedActions" :compact="compact" />
  <ContentPanel v-else-if="contentData" :data="contentData" :compact="compact" />
  <StatusPanel v-else-if="statusData" :data="statusData" :compact="compact" />
  <HealthcarePanel v-else-if="healthcareData" :data="healthcareData" :compact="compact" />
  <JobPanel v-else-if="jobData" :data="jobData" :actions="resolvedActions" :compact="compact" />
  <SupportPanel v-else-if="supportData" :data="supportData" :compact="compact" />
  <TestPanel v-else-if="testData" :data="testData" :compact="compact" />
</template>

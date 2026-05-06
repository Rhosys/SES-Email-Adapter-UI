<script setup lang="ts">
import type { Signal } from '@/types/server'
import AuthPanel from './panels/AuthPanel.vue'
import ConversationPanel from './panels/ConversationPanel.vue'
import CrmPanel from './panels/CrmPanel.vue'
import PackagePanel from './panels/PackagePanel.vue'
import TravelPanel from './panels/TravelPanel.vue'
import SchedulingPanel from './panels/SchedulingPanel.vue'
import PaymentsPanel from './panels/PaymentsPanel.vue'
import AlertPanel from './panels/AlertPanel.vue'
import ContentPanel from './panels/ContentPanel.vue'
import StatusPanel from './panels/StatusPanel.vue'
import HealthcarePanel from './panels/HealthcarePanel.vue'
import JobPanel from './panels/JobPanel.vue'
import SupportPanel from './panels/SupportPanel.vue'
import TestPanel from './panels/TestPanel.vue'

const props = defineProps<{ signal: Signal }>()

const data = props.signal.workflowData
</script>

<template>
  <template v-if="data">
    <AuthPanel v-if="data.workflow === 'auth'" :data="data" :received-at="signal.receivedAt" />
    <ConversationPanel v-else-if="data.workflow === 'conversation'" :data="data" />
    <CrmPanel v-else-if="data.workflow === 'crm'" :data="data" />
    <PackagePanel v-else-if="data.workflow === 'package'" :data="data" />
    <TravelPanel v-else-if="data.workflow === 'travel'" :data="data" />
    <SchedulingPanel v-else-if="data.workflow === 'scheduling'" :data="data" />
    <PaymentsPanel v-else-if="data.workflow === 'payments'" :data="data" />
    <AlertPanel v-else-if="data.workflow === 'alert'" :data="data" />
    <ContentPanel v-else-if="data.workflow === 'content'" :data="data" />
    <StatusPanel v-else-if="data.workflow === 'status'" :data="data" />
    <HealthcarePanel v-else-if="data.workflow === 'healthcare'" :data="data" />
    <JobPanel v-else-if="data.workflow === 'job'" :data="data" />
    <SupportPanel v-else-if="data.workflow === 'support'" :data="data" />
    <TestPanel v-else-if="data.workflow === 'test'" :data="data" />
  </template>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { JobData, SignalAction } from '@/types/server'

const props = defineProps<{ data: JobData; actions: SignalAction[] }>()

type JobStage = 'submitted' | 'reviewing' | 'interview' | 'offer' | 'rejected'
const stages: JobStage[] = ['submitted', 'reviewing', 'interview', 'offer', 'rejected']

const stageLabel: Record<JobStage, string> = {
  submitted: 'Applied',
  reviewing: 'In review',
  interview: 'Interviewing',
  offer: 'Offer received',
  rejected: 'Not selected',
}

const stageClass: Record<JobStage, string> = {
  submitted: 'text-ctp-subtext0',
  reviewing: 'text-ctp-blue',
  interview: 'text-ctp-peach',
  offer: 'text-ctp-green font-bold',
  rejected: 'italic text-ctp-subtext0',
}

const typeLabel: Record<JobData['jobType'], string> = {
  application_status: 'Application update',
  recruiter_outreach: 'Recruiter outreach',
  interview_request: 'Interview request',
  offer: 'Offer letter',
  rejection: 'Application update',
  job_posting: 'Job posting',
}

const currentStage = computed(() => props.data.applicationStatus ?? null)

const activeStageIndex = computed(() => {
  if (!currentStage.value || currentStage.value === 'rejected') return -1
  return stages.indexOf(currentStage.value)
})

const isRejected = computed(() => currentStage.value === 'rejected')

const interviewLabel = computed(() => {
  if (!props.data.interviewDate) return null
  const d = new Date(props.data.interviewDate)
  const diffMs = d.getTime() - Date.now()
  const diffHours = diffMs / 3_600_000
  if (diffHours < 0) return null
  if (diffHours < 24) {
    return `Today ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`
  }
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
})
</script>

<template>
  <div class="rounded-lg border border-ctp-surface1 bg-ctp-mantle p-4">
    <div class="mb-2 flex flex-wrap items-start justify-between gap-2">
      <div>
        <p class="text-sm font-medium text-ctp-text">{{ data.company ?? 'Company' }}</p>
        <p class="text-xs text-ctp-subtext0">{{ data.role ?? typeLabel[data.jobType] }}</p>
      </div>
      <div class="flex flex-col items-end gap-1">
        <span v-if="currentStage" class="text-xs" :class="stageClass[currentStage]">
          {{ stageLabel[currentStage] }}
        </span>
        <span v-if="data.salary" class="text-xs text-ctp-subtext0">{{ data.salary }}</span>
      </div>
    </div>

    <!-- Pipeline tracker -->
    <div v-if="currentStage" class="mb-2 flex items-center gap-0">
      <template v-for="(stage, i) in stages.slice(0, 4)" :key="stage">
        <div class="flex flex-col items-center">
          <div
            class="h-2.5 w-2.5 rounded-full border-2 transition-colors"
            :class="
              isRejected && i === activeStageIndex
                ? 'border-ctp-subtext0 bg-ctp-subtext0'
                : i <= activeStageIndex
                  ? 'border-ctp-green bg-ctp-green'
                  : 'border-ctp-overlay0 bg-transparent'
            "
          />
          <span class="mt-1 text-xs text-ctp-subtext0" style="white-space: nowrap">
            {{ stageLabel[stage] }}
          </span>
        </div>
        <div
          v-if="i < 3"
          class="mb-3 h-0.5 flex-1 transition-colors"
          :class="i < activeStageIndex ? 'bg-ctp-green' : 'bg-ctp-overlay0'"
        />
      </template>
    </div>

    <p v-if="interviewLabel" class="text-xs font-medium text-ctp-peach">
      Interview: {{ interviewLabel }}
    </p>

    <div v-if="actions.length" class="mt-3 flex flex-col gap-1">
      <a
        v-for="action in actions"
        :key="action.url"
        :href="action.url"
        target="_blank"
        rel="noopener noreferrer"
        class="text-xs text-ctp-blue hover:underline"
      >
        {{ action.text ?? 'View application →' }}
      </a>
    </div>
  </div>
</template>

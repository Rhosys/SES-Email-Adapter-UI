<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { PieChart, LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { useUiStore } from '@/stores/ui'
import { useAccountStore } from '@/stores/account'
import { api } from '@/lib/api'
import type { StatsResponse } from '@/types/server'

use([PieChart, LineChart, GridComponent, TooltipComponent, CanvasRenderer])

const uiStore = useUiStore()
const accountStore = useAccountStore()
const stats = ref<StatsResponse | null>(null)
const loading = ref(true)

onMounted(async () => {
  const id = accountStore.accountId
  if (!id) {
    loading.value = false
    return
  }
  const result = await api.getStats(id)
  loading.value = false
  if (result.isOk()) {
    stats.value = result.value
  }
})

const donutOption = computed(() => {
  const totals = stats.value?.totals ?? { allowed: 0, quarantined: 0, blocked: 0 }
  return {
    tooltip: { trigger: 'item' as const, confine: true },
    series: [
      {
        type: 'pie' as const,
        radius: ['55%', '85%'],
        data: [
          { value: totals.allowed, name: 'Allowed', itemStyle: { color: '#a6e3a1' } },
          { value: totals.quarantined, name: 'Quarantined', itemStyle: { color: '#f9e2af' } },
          { value: totals.blocked, name: 'Blocked', itemStyle: { color: '#f38ba8' } },
        ],
        emphasis: { scale: true, scaleSize: 4 },
        label: { show: false },
      },
    ],
  }
})

const areaOption = computed(() => {
  const daily = stats.value?.daily ?? []
  const dates = daily.map((d) => d.date)
  return {
    grid: { top: 4, right: 4, bottom: 4, left: 4 },
    xAxis: { type: 'category' as const, show: false, data: dates },
    yAxis: { type: 'value' as const, show: false },
    tooltip: { trigger: 'axis' as const, confine: true },
    series: [
      {
        type: 'line' as const,
        stack: 'total',
        areaStyle: { opacity: 0.4 },
        smooth: true,
        symbol: 'none',
        data: daily.map((d) => d.allowed),
        itemStyle: { color: '#a6e3a1' },
      },
      {
        type: 'line' as const,
        stack: 'total',
        areaStyle: { opacity: 0.4 },
        smooth: true,
        symbol: 'none',
        data: daily.map((d) => d.quarantined),
        itemStyle: { color: '#f9e2af' },
      },
      {
        type: 'line' as const,
        stack: 'total',
        areaStyle: { opacity: 0.4 },
        smooth: true,
        symbol: 'none',
        data: daily.map((d) => d.blocked),
        itemStyle: { color: '#f38ba8' },
      },
    ],
  }
})

const totals = computed(() => stats.value?.totals ?? { allowed: 0, quarantined: 0, blocked: 0 })

function toggleExpanded(e: Event) {
  e.preventDefault()
  e.stopPropagation()
  uiStore.statsWidgetExpanded = !uiStore.statsWidgetExpanded
}
</script>

<template>
  <div
    class="stats-widget mb-4 rounded-lg border border-ctp-surface0 bg-ctp-mantle transition-colors hover:border-ctp-surface1"
    :class="{ 'cursor-pointer': !uiStore.statsWidgetExpanded }"
    @click="!uiStore.statsWidgetExpanded && toggleExpanded($event)"
  >
    <div class="flex items-center justify-between px-3 py-2">
      <span class="text-xs font-medium text-ctp-subtext0 transition-colors hover:text-ctp-text">Stats</span>
      <button
        class="-m-2 p-2 text-ctp-subtext0 transition-transform hover:text-ctp-text"
        :class="{ 'rotate-180': uiStore.statsWidgetExpanded }"
        aria-label="Toggle stats widget"
        @click="toggleExpanded"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
    </div>

    <RouterLink
      v-if="uiStore.statsWidgetExpanded"
      :to="{ name: 'stats' }"
      class="block cursor-pointer px-3 pb-3 no-underline hover:bg-ctp-surface0/30"
    >
      <div v-if="loading" class="flex h-20 items-center justify-center">
        <div class="h-5 w-5 animate-spin rounded-full border-2 border-ctp-surface1 border-t-ctp-mauve" />
      </div>

      <div v-else class="flex items-center gap-4">
        <!-- Donut chart -->
        <div class="flex shrink-0 flex-col items-center">
          <VChart :option="donutOption" :autoresize="true" class="h-20 w-20" />
          <span class="mt-1 text-[10px] text-ctp-blue hover:underline">View full stats →</span>
        </div>

        <!-- Totals column -->
        <div class="flex shrink-0 flex-col gap-1 text-xs">
          <div class="flex items-center gap-1.5">
            <span class="inline-block h-2 w-2 rounded-full bg-[#a6e3a1]" />
            <span class="text-ctp-subtext1">{{ totals.allowed }}</span>
            <span class="text-ctp-subtext0">allowed</span>
          </div>
          <div class="flex items-center gap-1.5">
            <span class="inline-block h-2 w-2 rounded-full bg-[#f9e2af]" />
            <span class="text-ctp-subtext1">{{ totals.quarantined }}</span>
            <span class="text-ctp-subtext0">quarantined</span>
          </div>
          <div class="flex items-center gap-1.5">
            <span class="inline-block h-2 w-2 rounded-full bg-[#f38ba8]" />
            <span class="text-ctp-subtext1">{{ totals.blocked }}</span>
            <span class="text-ctp-subtext0">blocked</span>
          </div>
        </div>

        <!-- Stacked area chart -->
        <div class="min-w-0 flex-1">
          <VChart :option="areaOption" :autoresize="true" class="h-16 w-full" />
        </div>
      </div>
    </RouterLink>
  </div>
</template>

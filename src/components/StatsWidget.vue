<script setup lang="ts">
import { computed, onMounted, ref, nextTick } from 'vue'
import { RouterLink } from 'vue-router'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { PieChart, LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { useUiStore } from '@/stores/ui'
import { useStatsStore } from '@/stores/stats'

use([PieChart, LineChart, GridComponent, TooltipComponent, CanvasRenderer])

const uiStore = useUiStore()
const statsStore = useStatsStore()

const domReady = ref(false)

onMounted(async () => {
  await nextTick()
  domReady.value = true
  void statsStore.fetchStats()
})

const donutOption = computed(() => {
  const totals = statsStore.stats.totals
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
  const daily = statsStore.stats.daily
  const dates = daily.map((d) => d.date)
  return {
    grid: { top: 4, right: 4, bottom: 4, left: 4 },
    xAxis: { type: 'category' as const, show: false, data: dates, boundaryGap: false },
    yAxis: { type: 'value' as const, show: false, min: 0, minInterval: 1 },
    tooltip: { trigger: 'axis' as const, confine: true },
    series: [
      {
        name: 'Allowed',
        type: 'line' as const,
        stack: 'total',
        showSymbol: false,
        smooth: true,
        lineStyle: { width: 1 },
        areaStyle: { color: '#a6e3a1', opacity: 0.7 },
        itemStyle: { color: '#a6e3a1' },
        data: daily.map((d) => d.allowed),
      },
      {
        name: 'Quarantined',
        type: 'line' as const,
        stack: 'total',
        showSymbol: false,
        smooth: true,
        lineStyle: { width: 1 },
        areaStyle: { color: '#f9e2af', opacity: 0.7 },
        itemStyle: { color: '#f9e2af' },
        data: daily.map((d) => d.quarantined),
      },
      {
        name: 'Blocked',
        type: 'line' as const,
        stack: 'total',
        showSymbol: false,
        smooth: true,
        lineStyle: { width: 1 },
        areaStyle: { color: '#f38ba8', opacity: 0.7 },
        itemStyle: { color: '#f38ba8' },
        data: daily.map((d) => d.blocked),
      },
    ],
  }
})

const totals = computed(() => statsStore.stats.totals)
const stats = computed(() => statsStore.stats)

function toggleExpanded() {
  uiStore.statsWidgetExpanded = !uiStore.statsWidgetExpanded
}
</script>

<template>
  <div
    class="stats-widget mb-4 rounded-lg border border-ctp-surface0 bg-ctp-mantle transition-colors hover:border-ctp-surface1"
  >
    <!-- Single header button toggles expand/collapse. Kept as one control (not a
         clickable card wrapping a button + link) so interactive elements aren't
         nested — see a11y rule "nested-interactive". -->
    <button
      type="button"
      class="flex w-full items-center justify-between px-3 py-2 text-left"
      :aria-expanded="uiStore.statsWidgetExpanded"
      aria-label="Toggle stats widget"
      @click="toggleExpanded"
    >
      <span class="text-xs font-medium text-ctp-subtext0 transition-colors hover:text-ctp-text">Stats</span>
      <svg
        xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
        fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
        class="shrink-0 text-ctp-subtext0 transition-transform"
        :class="{ 'rotate-180': uiStore.statsWidgetExpanded }"
        aria-hidden="true"
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </button>

    <RouterLink
      v-if="uiStore.statsWidgetExpanded"
      :to="{ name: 'stats' }"
      class="block cursor-pointer px-3 pb-3 no-underline hover:bg-ctp-surface0/30"
    >
      <div v-if="!domReady || stats.daily.length === 0" class="flex h-20 items-center justify-center">
        <div class="h-5 w-5 animate-spin rounded-full border-2 border-ctp-surface1 border-t-ctp-mauve" />
      </div>

      <div v-else class="flex items-center gap-4">
        <!-- Donut chart -->
        <div class="flex shrink-0 flex-col items-center">
          <VChart :option="donutOption" :autoresize="true" style="height: 80px; width: 80px" />
          <span class="mt-1 text-[10px] text-ctp-blue hover:underline">View full stats →</span>
        </div>

        <!-- Totals column -->
        <div class="flex shrink-0 flex-col gap-1 text-xs">
          <div class="flex items-center gap-1.5">
            <span class="inline-block h-2 w-2 rounded-full bg-[#a6e3a1]" />
            <span class="text-ctp-subtext1">{{ totals.allowed }}</span>
            <span class="capitalize text-ctp-subtext0">allowed</span>
          </div>
          <div class="flex items-center gap-1.5">
            <span class="inline-block h-2 w-2 rounded-full bg-[#f9e2af]" />
            <span class="text-ctp-subtext1">{{ totals.quarantined }}</span>
            <span class="capitalize text-ctp-subtext0">quarantined</span>
          </div>
          <div class="flex items-center gap-1.5">
            <span class="inline-block h-2 w-2 rounded-full bg-[#f38ba8]" />
            <span class="text-ctp-subtext1">{{ totals.blocked }}</span>
            <span class="capitalize text-ctp-subtext0">blocked</span>
          </div>
          <div class="flex items-center gap-1.5">
            <span class="inline-block h-2 w-2 rounded-full bg-ctp-mauve" />
            <span class="text-ctp-subtext1">{{ totals.aliases }}</span>
            <span class="capitalize text-ctp-subtext0">aliases</span>
          </div>
        </div>

        <!-- Stacked area chart -->
        <div class="min-w-0 flex-1">
          <VChart :option="areaOption" :autoresize="true" style="height: 64px; width: 100%" />
        </div>
      </div>
    </RouterLink>
  </div>
</template>

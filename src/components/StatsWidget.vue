<script setup lang="ts">
import { computed, onMounted, ref, nextTick } from 'vue'
import { RouterLink } from 'vue-router'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { PieChart, BarChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { useUiStore } from '@/stores/ui'
import { useStatsStore } from '@/stores/stats'

use([PieChart, BarChart, GridComponent, TooltipComponent, CanvasRenderer])

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
  const total = daily.map((d) => d.allowed + d.quarantined + d.blocked)
  return {
    grid: { top: 4, right: 4, bottom: 4, left: 4 },
    xAxis: { type: 'category' as const, show: false, data: dates },
    yAxis: { type: 'value' as const, show: false, min: 0, minInterval: 1 },
    tooltip: { trigger: 'axis' as const, confine: true },
    series: [
      {
        type: 'bar' as const,
        data: total,
        itemStyle: { color: '#cba6f7' },
        barMaxWidth: 6,
      },
    ],
  }
})

const totals = computed(() => statsStore.stats.totals)
const stats = computed(() => statsStore.stats)

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
    role="button"
    tabindex="0"
    :aria-label="!uiStore.statsWidgetExpanded ? 'Expand stats widget' : undefined"
    @click="!uiStore.statsWidgetExpanded && toggleExpanded($event)"
    @keydown.enter="!uiStore.statsWidgetExpanded && toggleExpanded($event)"
    @keydown.space.prevent="!uiStore.statsWidgetExpanded && toggleExpanded($event)"
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
          <div class="flex items-center gap-1.5">
            <span class="inline-block h-2 w-2 rounded-full bg-ctp-mauve" />
            <span class="text-ctp-subtext1">{{ totals.aliases }}</span>
            <span class="text-ctp-subtext0">aliases</span>
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

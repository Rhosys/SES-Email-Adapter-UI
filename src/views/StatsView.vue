<script setup lang="ts">
import { computed, onMounted, ref, nextTick } from 'vue'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { useStatsStore } from '@/stores/stats'

use([LineChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer])

const statsStore = useStatsStore()

// Defer chart rendering until after DOM layout is complete
const domReady = ref(false)

onMounted(async () => {
  await nextTick()
  domReady.value = true
  void statsStore.fetchStats()
})

const totals = computed(() => statsStore.stats.totals)

const dailyAreaOption = computed(() => {
  const daily = statsStore.stats.daily
  const dates = daily.map((d) => d.date)
  return {
    tooltip: { trigger: 'axis' as const, confine: true },
    legend: {
      bottom: 0,
      textStyle: { color: '#a6adc8' },
      data: ['Allowed', 'Quarantined', 'Blocked'],
    },
    grid: { top: 16, right: 16, bottom: 40, left: 48 },
    xAxis: {
      type: 'category' as const,
      data: dates,
      boundaryGap: false,
      axisLabel: { color: '#a6adc8', fontSize: 10 },
      axisLine: { lineStyle: { color: '#45475a' } },
    },
    yAxis: {
      type: 'value' as const,
      min: 0,
      minInterval: 1,
      axisLabel: { color: '#a6adc8', fontSize: 10 },
      splitLine: { lineStyle: { color: '#313244' } },
    },
    series: [
      {
        name: 'Allowed',
        type: 'line' as const,
        stack: 'total',
        showSymbol: false,
        smooth: true,
        lineStyle: { width: 1 },
        areaStyle: { color: '#a6e3a1', opacity: 0.7 },
        data: daily.map((d) => d.allowed),
        itemStyle: { color: '#a6e3a1' },
      },
      {
        name: 'Quarantined',
        type: 'line' as const,
        stack: 'total',
        showSymbol: false,
        smooth: true,
        lineStyle: { width: 1 },
        areaStyle: { color: '#f9e2af', opacity: 0.7 },
        data: daily.map((d) => d.quarantined),
        itemStyle: { color: '#f9e2af' },
      },
      {
        name: 'Blocked',
        type: 'line' as const,
        stack: 'total',
        showSymbol: false,
        smooth: true,
        lineStyle: { width: 1 },
        areaStyle: { color: '#f38ba8', opacity: 0.7 },
        data: daily.map((d) => d.blocked),
        itemStyle: { color: '#f38ba8' },
      },
    ],
  }
})

const monthlyBarOption = computed(() => {
  const monthly = statsStore.stats.monthly
  const dates = monthly.map((d) => d.date)
  const showSymbol = monthly.length <= 3
  return {
    tooltip: { trigger: 'axis' as const, confine: true },
    legend: {
      bottom: 0,
      textStyle: { color: '#a6adc8' },
      data: ['Allowed', 'Quarantined', 'Blocked'],
    },
    grid: { top: 16, right: 16, bottom: 40, left: 48 },
    xAxis: {
      type: 'category' as const,
      data: dates,
      boundaryGap: false,
      axisLabel: { color: '#a6adc8', fontSize: 10 },
      axisLine: { lineStyle: { color: '#45475a' } },
    },
    yAxis: {
      type: 'value' as const,
      min: 0,
      minInterval: 1,
      axisLabel: { color: '#a6adc8', fontSize: 10 },
      splitLine: { lineStyle: { color: '#313244' } },
    },
    series: [
      {
        name: 'Allowed',
        type: 'line' as const,
        stack: 'total',
        showSymbol,
        smooth: true,
        lineStyle: { width: 1 },
        areaStyle: { color: '#a6e3a1', opacity: 0.7 },
        data: monthly.map((d) => d.allowed),
        itemStyle: { color: '#a6e3a1' },
      },
      {
        name: 'Quarantined',
        type: 'line' as const,
        stack: 'total',
        showSymbol,
        smooth: true,
        lineStyle: { width: 1 },
        areaStyle: { color: '#f9e2af', opacity: 0.7 },
        data: monthly.map((d) => d.quarantined),
        itemStyle: { color: '#f9e2af' },
      },
      {
        name: 'Blocked',
        type: 'line' as const,
        stack: 'total',
        showSymbol,
        smooth: true,
        lineStyle: { width: 1 },
        areaStyle: { color: '#f38ba8', opacity: 0.7 },
        data: monthly.map((d) => d.blocked),
        itemStyle: { color: '#f38ba8' },
      },
    ],
  }
})

const hasDaily = computed(() => domReady.value && statsStore.stats.daily.length > 0)
const hasMonthly = computed(() => domReady.value && statsStore.stats.monthly.length > 0)
</script>

<template>
  <div class="stats-view mx-auto max-w-5xl px-4 py-6">
    <h1 class="hidden text-lg font-semibold text-ctp-text sm:block">Stats</h1>

    <!-- Loading skeleton -->
    <div v-if="!hasDaily && !statsStore.error" class="mt-6 space-y-4">
      <div class="flex gap-6">
        <div v-for="i in 3" :key="i" class="h-16 w-32 animate-pulse rounded-lg bg-ctp-surface0" />
      </div>
      <div class="h-80 animate-pulse rounded-lg bg-ctp-surface0" />
      <div class="h-48 animate-pulse rounded-lg bg-ctp-surface0" />
    </div>

    <!-- Error state -->
    <div v-if="statsStore.error" class="mt-6 flex flex-col items-center gap-4 rounded-lg border border-ctp-surface0 bg-ctp-mantle p-8">
      <p class="text-sm text-ctp-red">{{ statsStore.error }}</p>
      <button
        class="rounded-md bg-ctp-blue px-4 py-2 text-sm font-medium text-ctp-base transition-colors hover:bg-ctp-sapphire"
        @click="statsStore.fetchStats"
      >
        Retry
      </button>
    </div>

    <!-- Stats content -->
    <div v-if="hasDaily" class="mt-6 space-y-6">
      <!-- Totals summary -->
      <div class="flex flex-wrap gap-6">
        <div class="flex items-center gap-2 rounded-lg border border-ctp-surface0 bg-ctp-mantle px-4 py-3">
          <span class="inline-block h-3 w-3 rounded-full bg-[#a6e3a1]" />
          <span class="text-2xl font-semibold text-ctp-text">{{ totals.allowed.toLocaleString() }}</span>
          <span class="text-sm text-ctp-subtext0">allowed</span>
        </div>
        <div class="flex items-center gap-2 rounded-lg border border-ctp-surface0 bg-ctp-mantle px-4 py-3">
          <span class="inline-block h-3 w-3 rounded-full bg-[#f9e2af]" />
          <span class="text-2xl font-semibold text-ctp-text">{{ totals.quarantined.toLocaleString() }}</span>
          <span class="text-sm text-ctp-subtext0">quarantined</span>
        </div>
        <div class="flex items-center gap-2 rounded-lg border border-ctp-surface0 bg-ctp-mantle px-4 py-3">
          <span class="inline-block h-3 w-3 rounded-full bg-[#f38ba8]" />
          <span class="text-2xl font-semibold text-ctp-text">{{ totals.blocked.toLocaleString() }}</span>
          <span class="text-sm text-ctp-subtext0">blocked</span>
        </div>
        <div class="flex items-center gap-2 rounded-lg border border-ctp-surface0 bg-ctp-mantle px-4 py-3">
          <span class="inline-block h-3 w-3 rounded-full bg-ctp-mauve" />
          <span class="text-2xl font-semibold text-ctp-text">{{ totals.aliases.toLocaleString() }}</span>
          <span class="text-sm text-ctp-subtext0">aliases</span>
        </div>
      </div>

      <!-- Daily stacked area chart -->
      <div class="rounded-lg border border-ctp-surface0 bg-ctp-mantle p-4">
        <h2 class="mb-3 text-sm font-medium text-ctp-subtext0">Daily (last 365 days)</h2>
        <VChart v-if="hasDaily" :key="'daily-' + statsStore.stats.daily.length" :option="dailyAreaOption" :autoresize="true" style="height: 320px; width: 100%" />
        <p v-else class="py-12 text-center text-sm text-ctp-subtext0">No daily data available</p>
      </div>

      <!-- Monthly bars chart -->
      <div v-if="hasMonthly" class="rounded-lg border border-ctp-surface0 bg-ctp-mantle p-4">
        <h2 class="mb-3 text-sm font-medium text-ctp-subtext0">Monthly</h2>
        <VChart :key="'monthly-' + statsStore.stats.monthly.length" :option="monthlyBarOption" :autoresize="true" style="height: 192px; width: 100%" />
      </div>
    </div>
  </div>
</template>

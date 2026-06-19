<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { LineChart, BarChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { useAccountStore } from '@/stores/account'
import { api } from '@/lib/api'
import type { StatsResponse } from '@/types/server'

use([LineChart, BarChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer])

const accountStore = useAccountStore()
const stats = ref<StatsResponse | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)

async function fetchStats() {
  const id = accountStore.accountId
  if (!id) {
    loading.value = false
    return
  }
  loading.value = true
  error.value = null
  const result = await api.getStats(id)
  loading.value = false
  if (result.isOk()) {
    stats.value = result.value
  } else {
    error.value = result.error.message
  }
}

onMounted(fetchStats)

const totals = computed(() => stats.value?.totals ?? { allowed: 0, quarantined: 0, blocked: 0 })

const dailyAreaOption = computed(() => {
  const daily = stats.value?.daily ?? []
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
      axisLabel: { color: '#a6adc8', fontSize: 10 },
      axisLine: { lineStyle: { color: '#45475a' } },
    },
    yAxis: {
      type: 'value' as const,
      axisLabel: { color: '#a6adc8', fontSize: 10 },
      splitLine: { lineStyle: { color: '#313244' } },
    },
    series: [
      {
        name: 'Allowed',
        type: 'line' as const,
        stack: 'total',
        areaStyle: { opacity: 0.4 },
        smooth: true,
        symbol: 'none',
        data: daily.map((d) => d.allowed),
        itemStyle: { color: '#a6e3a1' },
      },
      {
        name: 'Quarantined',
        type: 'line' as const,
        stack: 'total',
        areaStyle: { opacity: 0.4 },
        smooth: true,
        symbol: 'none',
        data: daily.map((d) => d.quarantined),
        itemStyle: { color: '#f9e2af' },
      },
      {
        name: 'Blocked',
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

const monthlyBarOption = computed(() => {
  const monthly = stats.value?.monthly ?? []
  const dates = monthly.map((d) => d.date)
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
      axisLabel: { color: '#a6adc8', fontSize: 10 },
      axisLine: { lineStyle: { color: '#45475a' } },
    },
    yAxis: {
      type: 'value' as const,
      axisLabel: { color: '#a6adc8', fontSize: 10 },
      splitLine: { lineStyle: { color: '#313244' } },
    },
    series: [
      {
        name: 'Allowed',
        type: 'bar' as const,
        stack: 'total',
        data: monthly.map((d) => d.allowed),
        itemStyle: { color: '#a6e3a1' },
      },
      {
        name: 'Quarantined',
        type: 'bar' as const,
        stack: 'total',
        data: monthly.map((d) => d.quarantined),
        itemStyle: { color: '#f9e2af' },
      },
      {
        name: 'Blocked',
        type: 'bar' as const,
        stack: 'total',
        data: monthly.map((d) => d.blocked),
        itemStyle: { color: '#f38ba8' },
      },
    ],
  }
})

const hasDaily = computed(() => (stats.value?.daily?.length ?? 0) > 0)
const hasMonthly = computed(() => (stats.value?.monthly?.length ?? 0) > 0)
</script>

<template>
  <div class="stats-view mx-auto max-w-5xl px-4 py-6">
    <h1 class="text-lg font-semibold text-ctp-text">Stats</h1>

    <!-- Loading skeleton -->
    <div v-if="loading" class="mt-6 space-y-4">
      <div class="flex gap-6">
        <div v-for="i in 3" :key="i" class="h-16 w-32 animate-pulse rounded-lg bg-ctp-surface0" />
      </div>
      <div class="h-80 animate-pulse rounded-lg bg-ctp-surface0" />
      <div class="h-48 animate-pulse rounded-lg bg-ctp-surface0" />
    </div>

    <!-- Error state -->
    <div v-else-if="error" class="mt-6 flex flex-col items-center gap-4 rounded-lg border border-ctp-surface0 bg-ctp-mantle p-8">
      <p class="text-sm text-ctp-red">{{ error }}</p>
      <button
        class="rounded-md bg-ctp-blue px-4 py-2 text-sm font-medium text-ctp-base transition-colors hover:bg-ctp-sapphire"
        @click="fetchStats"
      >
        Retry
      </button>
    </div>

    <!-- Stats content -->
    <div v-else class="mt-6 space-y-6">
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
      </div>

      <!-- Daily stacked area chart -->
      <div class="rounded-lg border border-ctp-surface0 bg-ctp-mantle p-4">
        <h2 class="mb-3 text-sm font-medium text-ctp-subtext0">Daily (last 365 days)</h2>
        <VChart v-if="hasDaily" :option="dailyAreaOption" :autoresize="true" class="h-80 w-full" />
        <p v-else class="py-12 text-center text-sm text-ctp-subtext0">No daily data available</p>
      </div>

      <!-- Monthly bars chart -->
      <div v-if="hasMonthly" class="rounded-lg border border-ctp-surface0 bg-ctp-mantle p-4">
        <h2 class="mb-3 text-sm font-medium text-ctp-subtext0">Monthly</h2>
        <VChart :option="monthlyBarOption" :autoresize="true" class="h-48 w-full" />
      </div>
    </div>
  </div>
</template>

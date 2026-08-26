<script setup lang="ts">
import { computed } from 'vue'
import JsonTreeNode from './JsonTreeNode.vue'

const props = withDefaults(
  defineProps<{
    data: unknown
    /** Attribute names whose value starts collapsed (objects/arrays collapse; long strings truncate). */
    collapsedKeys?: string[]
    /** String values longer than this collapse behind a toggle when their key is in collapsedKeys. */
    collapseStringsOver?: number
  }>(),
  { collapsedKeys: () => ['body'], collapseStringsOver: 80 },
)

const entries = computed<[string | number, unknown][]>(() => {
  if (Array.isArray(props.data)) return props.data.map((v, i) => [i, v])
  if (props.data !== null && typeof props.data === 'object') return Object.entries(props.data as Record<string, unknown>)
  return []
})
</script>

<template>
  <div class="json-view rounded-lg border border-ctp-surface1 bg-ctp-mantle p-3 font-mono text-sm">
    <JsonTreeNode
      v-for="[key, value] in entries"
      :key="key"
      :node-key="key"
      :value="value"
      :collapsed-keys="collapsedKeys"
      :collapse-strings-over="collapseStringsOver"
    />
  </div>
</template>

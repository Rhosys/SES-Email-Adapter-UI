<script setup lang="ts">
import { computed, ref } from 'vue'

const props = withDefaults(
  defineProps<{
    nodeKey: string | number
    value: unknown
    /** Attribute names whose value starts collapsed (objects/arrays collapse; long strings truncate). */
    collapsedKeys?: string[]
    /** String values longer than this collapse behind a toggle when their key is in collapsedKeys. */
    collapseStringsOver?: number
  }>(),
  { collapsedKeys: () => [], collapseStringsOver: 80 },
)

const isCollapsedKey = typeof props.nodeKey === 'string' && props.collapsedKeys.includes(props.nodeKey)

/** Shared by object/array disclosure and long-string truncation: closed by default only for configured keys. */
const open = ref(!isCollapsedKey)

const entries = computed<[string | number, unknown][]>(() => {
  if (Array.isArray(props.value)) return props.value.map((v, i) => [i, v])
  if (props.value !== null && typeof props.value === 'object') return Object.entries(props.value as Record<string, unknown>)
  return []
})

const isArray = computed(() => Array.isArray(props.value))
const isExpandable = computed(() => entries.value.length > 0)

const displayKey = computed(() => (isArray.value ? `[${props.nodeKey}]` : String(props.nodeKey)))

const itemLabel = computed(() => `${entries.value.length} ${entries.value.length === 1 ? 'item' : 'items'}`)

const isTruncatedString = computed(
  () => isCollapsedKey && typeof props.value === 'string' && props.value.length > props.collapseStringsOver && !open.value,
)

const valueDisplay = computed(() => {
  const v = props.value
  if (v === null) return { text: 'null', cls: 'text-ctp-mauve' }
  if (v === undefined) return { text: 'undefined', cls: 'text-ctp-mauve' }
  if (typeof v === 'boolean' || typeof v === 'number') return { text: String(v), cls: 'text-ctp-blue' }
  if (typeof v === 'string') return { text: `"${v}"`, cls: 'text-ctp-green' }
  if (Array.isArray(v)) return { text: v.length === 0 ? '[]' : '', cls: 'text-ctp-overlay0' }
  return { text: Object.keys(v as object).length === 0 ? '{}' : '', cls: 'text-ctp-overlay0' }
})
</script>

<template>
  <div class="tree-node">
    <!-- Expandable object/array: folder row -->
    <div
      v-if="isExpandable"
      class="tree-row group cursor-pointer select-none rounded-md px-1.5 py-1 hover:bg-ctp-surface0"
      role="treeitem"
      :aria-expanded="open"
      :aria-selected="false"
      tabindex="0"
      @click="open = !open"
      @keydown.enter="open = !open"
      @keydown.space.prevent="open = !open"
    >
      <svg
        class="node-caret h-4 w-4 shrink-0 text-ctp-subtext0 transition-transform duration-150 group-hover:text-ctp-text"
        :class="{ 'rotate-90': open }"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M9 6l6 6-6 6" />
      </svg>
      <svg class="h-4 w-4 shrink-0 text-ctp-yellow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path v-if="open" d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v1H3V7z" fill="currentColor" fill-opacity="0.25" />
        <path v-if="open" d="M3 8h18l-1.5 9.5a2 2 0 0 1-2 1.7H6.5a2 2 0 0 1-2-1.7L3 8z" />
        <path v-else d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6z" fill="currentColor" fill-opacity="0.2" />
      </svg>
      <span class="truncate font-medium text-ctp-text">{{ displayKey }}</span>
      <span v-if="!open" class="text-ctp-subtext0">{{ itemLabel }}</span>
    </div>

    <!-- Leaf value row -->
    <div v-else class="tree-row flex items-start gap-1.5 rounded-md px-1.5 py-1 hover:bg-ctp-surface0" role="treeitem" :aria-selected="false">
      <svg class="mt-0.5 h-4 w-4 shrink-0 text-ctp-overlay0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
        <path d="M13 2v7h7" />
      </svg>
      <span class="shrink-0 text-ctp-subtext1">{{ displayKey }}</span>
      <span class="shrink-0 text-ctp-subtext0">:</span>
      <button
        v-if="isTruncatedString"
        type="button"
        class="-my-1 inline-block rounded-md bg-ctp-surface0 px-2 py-1 text-left text-ctp-peach hover:bg-ctp-surface1 hover:underline"
        @click="open = true"
      >
        "{{ (value as string).slice(0, collapseStringsOver) }}…"
        <em class="not-italic text-ctp-subtext0">({{ (value as string).length }} chars — click to expand)</em>
      </button>
      <span v-else class="break-words whitespace-pre-wrap" :class="valueDisplay.cls">{{ valueDisplay.text }}</span>
    </div>

    <!-- Children, indented with an OS-explorer-style guide line -->
    <div v-if="isExpandable && open" class="tree-children ml-[7px] border-l border-ctp-surface1 pl-3">
      <JsonTreeNode
        v-for="[k, v] in entries"
        :key="k"
        :node-key="k"
        :value="v"
        :collapsed-keys="collapsedKeys"
        :collapse-strings-over="collapseStringsOver"
      />
    </div>
  </div>
</template>

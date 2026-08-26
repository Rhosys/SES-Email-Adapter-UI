<script setup lang="ts">
import { h, reactive } from 'vue'
import VueJsonPretty from 'vue-json-pretty'
import type { NodeDataType } from 'vue-json-pretty/types/components/TreeNode'
import 'vue-json-pretty/lib/styles.css'

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

const expandedPaths = reactive(new Set<string>())

function isCollapsedKey(key: string | number | undefined): boolean {
  return typeof key === 'string' && props.collapsedKeys.includes(key)
}

function pathCollapsible(node: NodeDataType): boolean {
  return isCollapsedKey(node.key)
}

function renderNodeValue(opt: { node: NodeDataType; defaultValue: unknown }): unknown {
  const { node, defaultValue } = opt
  if (
    node.type !== 'content' ||
    typeof node.content !== 'string' ||
    node.content.length <= props.collapseStringsOver ||
    !isCollapsedKey(node.key)
  ) {
    return defaultValue
  }

  if (expandedPaths.has(node.path)) {
    return defaultValue
  }

  return h(
    'span',
    {
      class: 'json-view-truncated',
      onClick: (e: MouseEvent) => {
        e.stopPropagation()
        expandedPaths.add(node.path)
      },
    },
    [`"${node.content.slice(0, props.collapseStringsOver)}…" `, h('em', `(${node.content.length} chars — click to expand)`)],
  )
}
</script>

<template>
  <div class="json-view rounded-lg border border-ctp-surface1 bg-ctp-mantle p-4 text-xs">
    <VueJsonPretty
      :data="data as never"
      theme="dark"
      :show-icon="true"
      :show-length="true"
      :path-collapsible="pathCollapsible"
      :render-node-value="renderNodeValue"
    />
  </div>
</template>

<style scoped>
.json-view :deep(.vjs-tree) {
  font-family: inherit;
  font-size: 0.75rem;
  color: var(--ctp-text);
  background: transparent;
}
.json-view :deep(.vjs-tree-node:hover),
.json-view :deep(.vjs-tree-node.is-highlight) {
  background-color: var(--ctp-surface0);
}
.json-view :deep(.vjs-key) {
  color: var(--ctp-subtext1);
}
.json-view :deep(.vjs-value-string) {
  color: var(--ctp-green);
}
.json-view :deep(.vjs-value-number),
.json-view :deep(.vjs-value-boolean) {
  color: var(--ctp-blue);
}
.json-view :deep(.vjs-value-null),
.json-view :deep(.vjs-value-undefined) {
  color: var(--ctp-mauve);
}
.json-view :deep(.vjs-comment) {
  color: var(--ctp-overlay0);
}
.json-view :deep(.json-view-truncated) {
  cursor: pointer;
  color: var(--ctp-peach);
}
.json-view :deep(.json-view-truncated:hover) {
  text-decoration: underline;
}
</style>

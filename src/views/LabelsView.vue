<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useLabelsStore } from '@/stores/labels'
import { useViewsStore } from '@/stores/views'
import type { Label, View, Workflow } from '@/types/server'
import AsyncButton from '@/components/ui/AsyncButton.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import { useConfirmDialog } from '@/composables/useConfirmDialog'

const route = useRoute()
const router = useRouter()
const labelsStore = useLabelsStore()
const viewsStore = useViewsStore()
const { dialogOpen, dialogOptions, confirm: confirmAction, onConfirm, onCancel } = useConfirmDialog()

const activeTab = ref<'labels' | 'views'>('labels')

// ─── Label form ───────────────────────────────────────────────────────────────
const showLabelForm = ref(false)
const editingLabel = ref<Label | null>(null)
const labelName = ref('')
const labelColor = ref('#cba6f7')
const labelIcon = ref('')
const labelPending = ref(false)

const PRESET_COLORS = [
  '#cba6f7', // mauve
  '#f38ba8', // red
  '#fab387', // peach
  '#f9e2af', // yellow
  '#a6e3a1', // green
  '#94e2d5', // teal
  '#89b4fa', // blue
  '#b4befe', // lavender
]

function openNewLabel() {
  editingLabel.value = null
  labelName.value = ''
  labelColor.value = '#cba6f7'
  labelIcon.value = ''
  showLabelForm.value = true
}

function openEditLabel(label: Label) {
  editingLabel.value = label
  labelName.value = label.name
  labelColor.value = label.color ?? '#cba6f7'
  labelIcon.value = label.icon ?? ''
  showLabelForm.value = true
}

function cancelLabel() {
  showLabelForm.value = false
  editingLabel.value = null
}

async function saveLabel() {
  if (!labelName.value.trim()) return
  labelPending.value = true
  const body = {
    name: labelName.value.trim(),
    color: labelColor.value || undefined,
    icon: labelIcon.value.trim() || undefined,
  }
  if (editingLabel.value) {
    await labelsStore.updateLabel(editingLabel.value.label, body)
  } else {
    await labelsStore.createLabel(body)
  }
  labelPending.value = false
  if (!labelsStore.error) cancelLabel()
}

async function deleteLabel(label: Label) {
  const confirmed = await confirmAction({ title: 'Delete label', message: `Delete label "${label.name}"?`, confirmLabel: 'Delete', confirmVariant: 'danger' })
  if (!confirmed) return
  await labelsStore.deleteLabel(label.label)
}

// ─── View form ────────────────────────────────────────────────────────────────
const showViewForm = ref(false)
const editingView = ref<View | null>(null)
const viewName = ref('')
const viewIcon = ref('')
const viewWorkflow = ref('')
const viewPending = ref(false)

const WORKFLOWS = [
  'auth',
  'conversation',
  'crm',
  'package',
  'travel',
  'scheduling',
  'payments',
  'alert',
  'content',
  'status',
  'healthcare',
  'job',
  'support',
  'test',
]

function openNewView() {
  editingView.value = null
  viewName.value = ''
  viewIcon.value = ''
  viewWorkflow.value = ''
  showViewForm.value = true
}

function openEditView(view: View) {
  editingView.value = view
  viewName.value = view.name
  viewIcon.value = view.icon ?? ''
  viewWorkflow.value = view.workflow ?? ''
  showViewForm.value = true
}

function cancelView() {
  showViewForm.value = false
  editingView.value = null
}

async function saveView() {
  if (!viewName.value.trim()) return
  viewPending.value = true
  const body = {
    name: viewName.value.trim(),
    icon: viewIcon.value.trim() || undefined,
    workflow: (viewWorkflow.value || undefined) as Workflow | undefined,
  }
  if (editingView.value) {
    await viewsStore.updateView(editingView.value.viewId, body)
  } else {
    await viewsStore.createView(body)
  }
  viewPending.value = false
  if (!viewsStore.error) cancelView()
}

async function deleteView(view: View) {
  const confirmed = await confirmAction({ title: 'Delete view', message: `Delete view "${view.name}"?`, confirmLabel: 'Delete', confirmVariant: 'danger' })
  if (!confirmed) return
  await viewsStore.deleteView(view.viewId)
}

const sortedViews = computed(() => viewsStore.sortedViews)

function clearErrors() {
  labelsStore.clearError()
  viewsStore.clearError()
}

function selectTab(tab: 'labels' | 'views') {
  activeTab.value = tab
  void router.replace({ query: tab === 'views' ? { tab: 'views' } : {} })
}

onMounted(async () => {
  if (route.query.tab === 'views') activeTab.value = 'views'
  await Promise.all([labelsStore.fetchLabels(), viewsStore.fetchViews()])
})
</script>

<template>
  <div>
    <header class="border-b border-ctp-surface0 bg-ctp-mantle px-4 py-3">
      <h1 class="hidden text-lg font-semibold sm:block">Labels &amp; Views</h1>
      <p class="mt-0.5 text-xs text-ctp-subtext0">
        Organize your inbox with labels and custom sidebar views
      </p>
    </header>

    <!-- Tabs -->
    <div class="border-b border-ctp-surface0 bg-ctp-mantle px-4">
      <div class="flex gap-4">
        <button
          class="border-b-2 px-1 py-2 text-sm transition-colors"
          :class="
            activeTab === 'labels'
              ? 'border-ctp-mauve text-ctp-text'
              : 'border-transparent text-ctp-subtext0 hover:text-ctp-text'
          "
          @click="selectTab('labels')"
        >
          Labels
        </button>
        <button
          class="border-b-2 px-1 py-2 text-sm transition-colors"
          :class="
            activeTab === 'views'
              ? 'border-ctp-mauve text-ctp-text'
              : 'border-transparent text-ctp-subtext0 hover:text-ctp-text'
          "
          @click="selectTab('views')"
        >
          Views
        </button>
      </div>
    </div>

    <main class="mx-auto max-w-2xl px-4 py-6">
      <!-- Error banner -->
      <div
        v-if="labelsStore.error || viewsStore.error"
        class="mb-4 rounded-lg border border-ctp-red bg-ctp-red/10 px-4 py-3 text-sm text-ctp-red"
      >
        {{ labelsStore.error || viewsStore.error }}
        <button class="ml-2 underline" @click="clearErrors">Dismiss</button>
      </div>

      <!-- ── Labels tab ─────────────────────────────────────────────────────── -->
      <section v-if="activeTab === 'labels'">
        <div class="mb-4 flex items-center justify-between">
          <h2 class="text-sm font-medium text-ctp-subtext1">Your labels</h2>
          <button
            class="rounded bg-ctp-mauve px-3 py-1.5 text-xs font-medium text-ctp-base hover:opacity-90"
            @click="openNewLabel"
          >
            + New label
          </button>
        </div>

        <!-- Label form -->
        <div
          v-if="showLabelForm"
          class="mb-4 rounded-lg border border-ctp-surface1 bg-ctp-mantle p-4"
        >
          <div class="mb-3 flex items-center gap-3">
            <span
              class="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium text-white"
              :style="{ backgroundColor: labelColor }"
            >
              <span v-if="labelIcon">{{ labelIcon }}</span>
              {{ labelName || 'Label name' }}
            </span>
            <span class="text-xs text-ctp-subtext0">{{ editingLabel ? 'Editing' : 'New label' }}</span>
          </div>
          <div class="space-y-3">
            <div>
              <label for="label-name" class="mb-1 block text-xs text-ctp-subtext0">Name</label>
              <input
                id="label-name"
                v-model="labelName"
                type="text"
                placeholder="e.g. Newsletters"
                class="w-full rounded border border-ctp-surface1 bg-ctp-base px-3 py-1.5 text-sm text-ctp-text placeholder:text-ctp-subtext0 focus:border-ctp-mauve focus:outline-none"
              />
            </div>
            <div>
              <label for="label-color" class="mb-1 block text-xs text-ctp-subtext0">Color</label>
              <div class="flex flex-wrap gap-2">
                <button
                  v-for="color in PRESET_COLORS"
                  :key="color"
                  class="h-6 w-6 rounded-full border-2 transition-transform"
                  :class="labelColor === color ? 'ring-2 ring-offset-2 ring-offset-ctp-mantle ring-white scale-125 border-transparent' : 'border-transparent hover:scale-110'"
                  :style="{ backgroundColor: color }"
                  :aria-label="`Select color ${color}`"
                  @click="labelColor = color"
                />
                <input
                  id="label-color"
                  v-model="labelColor"
                  type="color"
                  class="h-6 w-6 cursor-pointer rounded border-0 bg-transparent p-0"
                  title="Custom color"
                />
              </div>
            </div>
            <div>
              <label for="label-icon" class="mb-1 block text-xs text-ctp-subtext0">Icon (emoji, optional)</label>
              <input
                id="label-icon"
                v-model="labelIcon"
                type="text"
                maxlength="1"
                placeholder="e.g. 📧"
                class="w-24 rounded border border-ctp-surface1 bg-ctp-base px-3 py-1.5 text-sm text-ctp-text placeholder:text-ctp-subtext0 focus:border-ctp-mauve focus:outline-none"
              />
            </div>
          </div>
          <div class="mt-4 flex gap-2">
            <AsyncButton
              :action="saveLabel"
              :disabled="!labelName.trim()"
              class="rounded bg-ctp-mauve px-3 py-1.5 text-xs font-medium text-ctp-base hover:opacity-90"
            >
              Save
            </AsyncButton>
            <button
              class="rounded border border-ctp-surface1 px-3 py-1.5 text-xs text-ctp-subtext1 hover:text-ctp-text"
              @click="cancelLabel"
            >
              Cancel
            </button>
          </div>
        </div>

        <!-- Label list -->
        <div
          v-if="labelsStore.loading"
          role="status"
          aria-label="Loading labels…"
          class="animate-pulse divide-y divide-ctp-surface0 rounded-lg border border-ctp-surface0"
        >
          <div v-for="i in 3" :key="i" class="flex items-center gap-3 px-4 py-3">
            <div class="h-5 w-5 shrink-0 rounded-full bg-ctp-surface1" />
            <div class="h-4 rounded bg-ctp-surface1" :style="{ width: `${35 + (i * 23) % 40}%` }" />
            <div class="ml-auto h-6 w-14 shrink-0 rounded bg-ctp-surface1" />
            <div class="h-6 w-14 shrink-0 rounded bg-ctp-surface1" />
          </div>
        </div>
        <div
          v-else-if="labelsStore.items.length === 0 && !showLabelForm"
          class="py-20 text-center"
        >
          <p class="text-base font-medium text-ctp-text">No labels yet</p>
          <p class="mx-auto mt-2 max-w-sm text-sm text-ctp-subtext0">
            Labels make it easy to group and filter threads at a glance. Create one and start attaching it in rules.
          </p>
        </div>
        <TransitionGroup v-else name="list" tag="div" class="relative divide-y divide-ctp-surface0 rounded-lg border border-ctp-surface0">
          <div
            v-for="label in labelsStore.items"
            :key="label.label"
            class="flex items-center gap-3 px-4 py-3"
          >
            <span
              class="h-3 w-3 shrink-0 rounded-full"
              :style="{ backgroundColor: label.color ?? '#cba6f7' }"
            />
            <span v-if="label.icon" class="shrink-0 text-sm">{{ label.icon }}</span>
            <span class="flex-1 text-sm font-medium">{{ label.name }}</span>
            <button
              class="text-xs text-ctp-subtext0 hover:text-ctp-text"
              @click="openEditLabel(label)"
            >
              Edit
            </button>
            <button class="text-ctp-subtext0 hover:text-ctp-red" title="Delete" @click="deleteLabel(label)">
              <svg class="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4h12M5.333 4V2.667a1.333 1.333 0 011.334-1.334h2.666a1.333 1.333 0 011.334 1.334V4m2 0v9.333a1.333 1.333 0 01-1.334 1.334H4.667a1.333 1.333 0 01-1.334-1.334V4h9.334z"/></svg>
            </button>
          </div>
        </TransitionGroup>
      </section>

      <!-- ── Views tab ──────────────────────────────────────────────────────── -->
      <section v-else-if="activeTab === 'views'">
        <div class="mb-4 flex items-center justify-between">
          <div>
            <h2 class="text-sm font-medium text-ctp-subtext1">Custom sidebar views</h2>
            <p class="mt-0.5 text-xs text-ctp-subtext0">
              Saved searches that appear in the sidebar. Drag to reorder.
            </p>
          </div>
          <button
            class="rounded bg-ctp-mauve px-3 py-1.5 text-xs font-medium text-ctp-base hover:opacity-90"
            @click="openNewView"
          >
            + New view
          </button>
        </div>

        <!-- View form -->
        <div
          v-if="showViewForm"
          class="mb-4 rounded-lg border border-ctp-surface1 bg-ctp-mantle p-4"
        >
          <h3 class="mb-3 text-sm font-medium">
            {{ editingView ? 'Edit view' : 'New view' }}
          </h3>
          <div class="space-y-3">
            <div>
              <label for="view-name" class="mb-1 block text-xs text-ctp-subtext0">Name</label>
              <input
                id="view-name"
                v-model="viewName"
                type="text"
                placeholder="e.g. Newsletters"
                class="w-full rounded border border-ctp-surface1 bg-ctp-base px-3 py-1.5 text-sm text-ctp-text placeholder:text-ctp-subtext0 focus:border-ctp-mauve focus:outline-none"
              />
            </div>
            <div>
              <label for="view-icon" class="mb-1 block text-xs text-ctp-subtext0">Icon (emoji, optional)</label>
              <input
                id="view-icon"
                v-model="viewIcon"
                type="text"
                placeholder="e.g. 📰"
                class="w-24 rounded border border-ctp-surface1 bg-ctp-base px-3 py-1.5 text-sm text-ctp-text placeholder:text-ctp-subtext0 focus:border-ctp-mauve focus:outline-none"
              />
            </div>
            <div class="grid gap-3 sm:grid-cols-2">
              <div>
                <label for="view-workflow" class="mb-1 block text-xs text-ctp-subtext0">Workflow filter</label>
                <select
                  id="view-workflow"
                  v-model="viewWorkflow"
                  class="w-full rounded border border-ctp-surface1 bg-ctp-base px-3 py-1.5 text-sm text-ctp-text focus:border-ctp-mauve focus:outline-none"
                >
                  <option value="">Any workflow</option>
                  <option v-for="wf in WORKFLOWS" :key="wf" :value="wf">{{ wf }}</option>
                </select>
                <p class="mt-1 text-xs text-ctp-subtext0">
                  Limit this view to threads from a specific automation workflow. Leave blank to show
                  all workflows.
                </p>
              </div>
            </div>
          </div>
          <div class="mt-4 flex gap-2">
            <AsyncButton
              :action="saveView"
              :disabled="!viewName.trim()"
              class="rounded bg-ctp-mauve px-3 py-1.5 text-xs font-medium text-ctp-base hover:opacity-90"
            >
              Save
            </AsyncButton>
            <button
              class="rounded border border-ctp-surface1 px-3 py-1.5 text-xs text-ctp-subtext1 hover:text-ctp-text"
              @click="cancelView"
            >
              Cancel
            </button>
          </div>
        </div>

        <!-- Views list -->
        <div
          v-if="viewsStore.loading"
          role="status"
          aria-label="Loading saved views…"
          class="animate-pulse divide-y divide-ctp-surface0 rounded-lg border border-ctp-surface0"
        >
          <div v-for="i in 3" :key="i" class="flex items-center gap-3 px-4 py-3">
            <div class="h-5 w-5 shrink-0 rounded bg-ctp-surface1" />
            <div class="flex-1 space-y-1">
              <div class="h-4 rounded bg-ctp-surface1" :style="{ width: `${30 + (i * 21) % 45}%` }" />
              <div class="h-3 w-24 rounded bg-ctp-surface1" />
            </div>
            <div class="h-6 w-14 shrink-0 rounded bg-ctp-surface1" />
            <div class="h-6 w-14 shrink-0 rounded bg-ctp-surface1" />
          </div>
        </div>
        <div
          v-else-if="sortedViews.length === 0 && !showViewForm"
          class="py-20 text-center"
        >
          <p class="text-base font-medium text-ctp-text">No saved views yet</p>
          <p class="mx-auto mt-2 max-w-sm text-sm text-ctp-subtext0">
            Save a filtered view of your inbox as a shortcut — it appears in the sidebar so you're
            one click away from exactly what you need.
          </p>
        </div>
        <TransitionGroup v-else name="list" tag="div" class="relative divide-y divide-ctp-surface0 rounded-lg border border-ctp-surface0">
          <div v-for="view in sortedViews" :key="view.viewId" class="flex items-center gap-3 px-4 py-3">
            <span class="shrink-0 text-base">{{ view.icon ?? '📋' }}</span>
            <div class="flex-1">
              <p class="text-sm font-medium">{{ view.name }}</p>
              <p class="text-xs text-ctp-subtext0">
                <span v-if="view.workflow">workflow: {{ view.workflow }}</span>
                <span v-if="!view.workflow">No filters</span>
              </p>
            </div>
            <button
              class="text-xs text-ctp-subtext0 hover:text-ctp-text"
              @click="openEditView(view)"
            >
              Edit
            </button>
            <button class="text-ctp-subtext0 hover:text-ctp-red" title="Delete" @click="deleteView(view)">
              <svg class="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4h12M5.333 4V2.667a1.333 1.333 0 011.334-1.334h2.666a1.333 1.333 0 011.334 1.334V4m2 0v9.333a1.333 1.333 0 01-1.334 1.334H4.667a1.333 1.333 0 01-1.334-1.334V4h9.334z"/></svg>
            </button>
          </div>
        </TransitionGroup>
      </section>
    </main>

    <ConfirmDialog :open="dialogOpen" :title="dialogOptions.title" :message="dialogOptions.message" :confirm-label="dialogOptions.confirmLabel" :confirm-variant="dialogOptions.confirmVariant" @confirm="onConfirm" @cancel="onCancel" />
  </div>
</template>

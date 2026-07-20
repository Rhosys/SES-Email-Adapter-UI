<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useAccountStore } from '@/stores/account'
import { api } from '@/lib/api'
import { useFeatureTour } from '@/composables/useFeatureTour'
import { useIsMobile } from '@/composables/useIsMobile'
import { computeTooltipPosition } from '@/lib/tooltipPosition'

const accountStore = useAccountStore()
const { tourActive, endTour } = useFeatureTour()
const isMobile = useIsMobile()

interface TourStep {
  target: string
  title: string
  description: string
}

const STEPS: TourStep[] = [
  {
    target: 'nav-inbox',
    title: 'Your inbox',
    description:
      'Active email threads land here. Click any thread to read, reply, or archive it.',
  },
  {
    target: 'nav-quarantine',
    title: 'Quarantine',
    description:
      'Emails from new senders wait here — you decide whether to approve or block them.',
  },
  {
    target: 'nav-rules',
    title: 'Automation rules',
    description:
      'Match emails by sender, subject, or content — then auto-archive, label, or block.',
  },
  {
    target: 'nav-templates',
    title: 'Reply templates',
    description:
      'Create reusable email templates with variables — auto-reply or one-click compose.',
  },
]

const currentStep = ref(0)
const spotlightRect = ref<{ left: number; top: number; width: number; height: number } | null>(
  null,
)
const tooltipEl = ref<HTMLElement | null>(null)
const tooltipPos = ref<{ left: number; top: number } | null>(null)

const step = computed(() => STEPS[currentStep.value])
const isLast = computed(() => currentStep.value === STEPS.length - 1)

function updateSpotlight() {
  const el = document.querySelector(`[data-tour="${step.value.target}"]`)
  if (!el) {
    spotlightRect.value = null
    return
  }
  const r = el.getBoundingClientRect()
  spotlightRect.value = { left: r.left - 6, top: r.top - 4, width: r.width + 12, height: r.height + 8 }
}

function positionTooltip() {
  if (!spotlightRect.value) {
    tooltipPos.value = null
    return
  }
  const cardWidth = tooltipEl.value?.offsetWidth ?? 288
  const cardHeight = tooltipEl.value?.offsetHeight ?? 200
  tooltipPos.value = computeTooltipPosition(
    spotlightRect.value,
    { width: window.innerWidth, height: window.innerHeight },
    { width: cardWidth, height: cardHeight },
  )
}

/**
 * Waits for the target's sidebar ancestor (if any) to finish its open/close
 * CSS transition before the caller measures it. Without this, a mobile tour
 * that auto-opens the sidebar (see AppLayout.vue) would spotlight the
 * sidebar's still-animating, off-screen mid-transition position. Resolves
 * immediately if the target has no sidebar ancestor at all.
 */
function waitForSidebarSettle(el: Element): Promise<void> {
  const aside = el.closest('aside')
  if (!aside) return Promise.resolve()
  return new Promise((resolve) => {
    let done = false
    const finish = () => {
      if (done) return
      done = true
      aside.removeEventListener('transitionend', onEnd)
      resolve()
    }
    const onEnd = (e: Event) => {
      if (e instanceof TransitionEvent && e.propertyName === 'transform') finish()
    }
    aside.addEventListener('transitionend', onEnd)
    // Safety net in case no transition actually runs (e.g. the sidebar was
    // already open) — comfortably longer than AppSidebar's 200ms duration.
    setTimeout(finish, 300)
  })
}

/** Waiting for the sidebar only matters on mobile — desktop's sidebar never
 * transitions (sm:transition-none), so skip the wait entirely there rather
 * than pay even the transitionend/fallback-timeout round trip. */
async function activateStep() {
  await nextTick()
  if (isMobile.value) {
    const el = document.querySelector(`[data-tour="${step.value.target}"]`)
    if (el) await waitForSidebarSettle(el)
  }
  updateSpotlight()
  positionTooltip()
}

watch(currentStep, () => {
  void activateStep()
})

watch(tourActive, (v) => {
  if (v) {
    currentStep.value = 0
    void activateStep()
  }
})

const tooltipStyle = computed(() => {
  if (!tooltipPos.value) return { left: '280px', top: '50%', transform: 'translateY(-50%)' }
  return { left: `${tooltipPos.value.left}px`, top: `${tooltipPos.value.top}px` }
})

function onResize() {
  updateSpotlight()
  positionTooltip()
}

onMounted(() => {
  window.addEventListener('resize', onResize)
  // Covers startTour() having been called before this component ever
  // mounted (the onboarding-completion flow, OnboardingView.vue — a
  // top-level route rendered outside AppLayout/FeatureTour) — tourActive is
  // already true by the time we get here, so the watch() above never fires
  // for it on its own (it only reacts to *changes*).
  if (tourActive.value) void activateStep()
})

onUnmounted(() => {
  window.removeEventListener('resize', onResize)
})

function prev() {
  if (currentStep.value > 0) currentStep.value--
}

async function next() {
  if (isLast.value) {
    await finish()
  } else {
    currentStep.value++
  }
}

async function finish() {
  endTour()
  if (accountStore.accountId) {
    await api.updateAccount(accountStore.accountId, {
      onboarding: { completed: true },
    })
    if (accountStore.account?.onboarding) {
      accountStore.account.onboarding.completed = true
    }
  }
}

function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape') void finish()
  if (e.key === 'ArrowRight') void next()
  if (e.key === 'ArrowLeft') prev()
}
</script>

<template>
  <Teleport to="body">
    <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions -->
    <div
      v-if="tourActive"
      class="fixed inset-0 z-[180]"
      role="dialog"
      aria-modal="true"
      :aria-label="`Feature tour: ${step.title}`"
      tabindex="-1"
      @keydown="onKeyDown"
    >
      <!-- Dark overlay with spotlight hole via box-shadow -->
      <div class="pointer-events-none fixed inset-0">
        <div
          v-if="spotlightRect"
          class="absolute rounded-lg transition-all duration-300 ease-in-out"
          :style="{
            left: `${spotlightRect.left}px`,
            top: `${spotlightRect.top}px`,
            width: `${spotlightRect.width}px`,
            height: `${spotlightRect.height}px`,
            boxShadow: '0 0 0 9999px rgba(24,24,37,0.82)',
          }"
        />
        <div v-else class="fixed inset-0 bg-ctp-base/80" />
      </div>

      <!-- Tooltip card -->
      <div
        ref="tooltipEl"
        class="fixed z-10 w-72 rounded-xl border border-ctp-surface1 bg-ctp-mantle p-4 shadow-2xl"
        :style="tooltipStyle"
      >
        <!-- Progress dots -->
        <div class="mb-3 flex items-center gap-1.5">
          <button
            v-for="(_, i) in STEPS"
            :key="i"
            class="h-1.5 rounded-full transition-all duration-200"
            :class="i === currentStep ? 'w-5 bg-ctp-mauve' : 'w-1.5 bg-ctp-surface2'"
            :aria-label="`Go to step ${i + 1}`"
            @click="currentStep = i"
          />
        </div>

        <h3 class="text-sm font-semibold text-ctp-text">{{ step.title }}</h3>
        <p class="mt-1 text-xs leading-relaxed text-ctp-subtext0">{{ step.description }}</p>

        <div class="mt-4 flex items-center gap-2">
          <button
            class="text-xs text-ctp-subtext0 hover:text-ctp-text"
            @click="finish"
          >
            Skip tour
          </button>
          <div class="ml-auto flex items-center gap-2">
            <button
              v-if="currentStep > 0"
              class="rounded-lg border border-ctp-surface1 px-3 py-1.5 text-xs text-ctp-subtext1 transition-colors hover:text-ctp-text"
              @click="prev"
            >
              Back
            </button>
            <button
              class="rounded-lg bg-ctp-mauve px-3 py-1.5 text-xs font-semibold text-ctp-base transition-opacity hover:opacity-90"
              @click="next"
            >
              {{ isLast ? 'Done ✓' : 'Next →' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

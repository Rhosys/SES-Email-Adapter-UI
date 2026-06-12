<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useAccountStore } from '@/stores/account'
import { api } from '@/lib/api'
import { useFeatureTour } from '@/composables/useFeatureTour'

const accountStore = useAccountStore()
const { tourActive, endTour } = useFeatureTour()

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
]

const currentStep = ref(0)
const spotlightRect = ref<{ left: number; top: number; width: number; height: number } | null>(
  null,
)

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

watch(currentStep, async () => {
  await nextTick()
  updateSpotlight()
})

watch(tourActive, async (v) => {
  if (v) {
    currentStep.value = 0
    await nextTick()
    updateSpotlight()
  }
})

const tooltipStyle = computed(() => {
  if (!spotlightRect.value) return { left: '280px', top: '50%', transform: 'translateY(-50%)' }
  const r = spotlightRect.value
  const top = Math.min(
    window.innerHeight - 210,
    Math.max(8, r.top + r.height / 2 - 100),
  )
  return {
    left: `${r.left + r.width + 16}px`,
    top: `${top}px`,
  }
})

function onResize() {
  updateSpotlight()
}

onMounted(() => {
  window.addEventListener('resize', onResize)
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

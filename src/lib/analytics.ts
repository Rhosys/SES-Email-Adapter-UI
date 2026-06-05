import 'posthog-js/dist/recorder'
import 'posthog-js/dist/surveys'
import 'posthog-js/dist/exception-autocapture'
import 'posthog-js/dist/tracing-headers'
import 'posthog-js/dist/web-vitals'
import posthog from 'posthog-js'
import environment from './environment'

const key = (import.meta.env.VITE_POSTHOG_KEY as string) ?? 'phc_U2h7kAvWiXEAp0RzyaOxrhFJddQdJGWEWjiEHZhoRzR'
const host = import.meta.env.VITE_POSTHOG_HOST ?? 'https://eu.posthog.com'
const uiHost = host.includes('posthog.com') ? host : 'https://eu.posthog.com'

if (environment === 'production' && key) {
  posthog.init(key, {
    api_host: host,
    ui_host: uiHost,
    person_profiles: 'identified_only',
    disable_external_dependency_loading: true,
    persistence: 'localStorage',
    // Session recording is started explicitly after user identification
    disable_session_recording: true,
    session_recording: {
      maskAllInputs: true,
      maskInputFn(text, element) {
        const sensitiveTypes = ['email', 'password']
        const elType = element?.attributes?.getNamedItem('type')?.value ?? ''
        const elId = element?.attributes?.getNamedItem('id')?.value ?? ''
        if (sensitiveTypes.includes(elType) || sensitiveTypes.includes(elId)) {
          return '•'.repeat(text.length)
        }
        if ((element as { className?: unknown })?.className && String((element as { className?: unknown }).className).match(/fs-exclude|ph-no-capture|sensitive/)) {
          return '•'.repeat(text.length)
        }
        if ((element as HTMLElement | undefined)?.closest?.('.fs-exclude, .ph-no-capture, .sensitive')) {
          return '•'.repeat(text.length)
        }
        return text
      },
      maskTextSelector: '.fs-exclude, .ph-no-capture, .sensitive',
    },
  })
}

let identified = false

export function identifyUser(userId: string, accountId?: string | null) {
  if (!key || environment !== 'production') return
  posthog.identify(userId, { userId, accountId: accountId ?? undefined, environment: environment ?? 'unknown' })
  if (accountId) {
    posthog.group('accountId', accountId, {})
  }
  posthog.register({ accountId: accountId ?? undefined })
  if (!identified) {
    identified = true
    posthog.startSessionRecording()
    posthog.capture('session_started')
  }
}

export function resetAnalytics() {
  if (!key) return
  try {
    posthog.reset()
    identified = false
  } catch {
    // best-effort
  }
}

export function capture(event: string, data?: Record<string, unknown>) {
  if (!key) return
  try {
    posthog.capture(event, data ?? {})
  } catch {
    // best-effort
  }
}

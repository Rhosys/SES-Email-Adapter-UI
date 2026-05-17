/* eslint-disable no-console */
import posthog from 'posthog-js'
import buildInfo from './buildInfo'
import environment from './environment'

const SESSION_ID_KEY = 'ses-email-adapter-sessionId'
const BASE_URL = 'https://relay.rhosys.ch/v1/logs'

type ContextGetter = () => { userId?: string; accountId?: string }
type RouteGetter = () => string

function safeStringify(value: unknown): string {
  const seen = new WeakSet()
  return JSON.stringify(
    value,
    (_key, val) => {
      try {
        if (val instanceof Error) {
          const err: Record<string, unknown> = {}
          Object.getOwnPropertyNames(val).forEach((k) => {
            err[k] = (val as unknown as Record<string, unknown>)[k]
          })
          return err
        }
        if (val instanceof URL) return val.toString()
        if (typeof val === 'object' && val !== null) {
          if (seen.has(val)) return '[Circular]'
          seen.add(val)
        }
      } catch {
        return '<Logger-FailedToSerialize>'
      }
      return val
    },
  )
}

function detectBrowser(): string {
  if (typeof navigator === 'undefined') return 'Unknown'
  if ('userAgentData' in navigator) return 'Chromium'
  if (typeof (window as unknown as Record<string, unknown>).InstallTrigger !== 'undefined')
    return 'Firefox'
  if (/constructor/i.test(String(window.HTMLElement))) return 'Safari'
  return 'Unknown'
}

class Logger {
  private sessionKey: string
  private messagesToPost: string[]
  private getContext: ContextGetter
  private getRoute: RouteGetter

  constructor() {
    this.messagesToPost = []
    this.getContext = () => ({})
    this.getRoute = () => (typeof window !== 'undefined' ? window.location.pathname : 'unknown')
    this.sessionKey =
      (typeof localStorage !== 'undefined' && localStorage.getItem(SESSION_ID_KEY)) ||
      crypto.randomUUID()

    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(SESSION_ID_KEY, this.sessionKey)
        const cookieDomain = window.location.hostname.split('.').reverse().slice(0, 2).reverse().join('.')
        const expires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toUTCString()
        document.cookie = `Session=${this.sessionKey}; expires=${expires}; path=/; domain=${cookieDomain}; SameSite=Lax`
      } catch {
        // Storage may be unavailable in sandboxed contexts
      }
    }

    if (typeof window !== 'undefined') {
      window.setInterval(() => this.flush(), 15_000)
    }
  }

  setContext(fn: ContextGetter) {
    this.getContext = fn
  }

  setRouteGetter(fn: RouteGetter) {
    this.getRoute = fn
  }

  critical(message: unknown, display = true) {
    if (display) console.error(message)
    else console.debug(message)
    this.logInternal(message, 'CRITICAL')
  }

  error(message: unknown, display = true) {
    if (display) console.error(message)
    else console.debug(message)
    this.logInternal(message, 'ERROR')
  }

  warn(message: unknown, display = true) {
    if (display) console.warn(message)
    else console.debug(message)
    this.logInternal(message, 'WARN')
  }

  log(message: unknown, display = true) {
    if (display) console.info(message)
    else console.debug(message)
    this.logInternal(message, 'INFO')
  }

  info(message: unknown, display = true) {
    if (display) console.info(message)
    else console.debug(message)
    this.logInternal(message, 'INFO')
  }

  track(message: unknown, display = false) {
    if (display) console.info(message)
    else console.debug(message)
    this.logInternal(message, 'TRACK')
  }

  debug(message: unknown, display = false) {
    if (display || environment === 'development') console.debug(message)
    this.logInternal(message, 'DEBUG')
  }

  private logInternal(message: unknown, level = 'INFO') {
    if (!message) {
      console.error('Logger requires a value to log.')
      return
    }

    const type = typeof message
    let messageAsObject: Record<string, unknown>
    if (type === 'string' && (message as string) !== '') {
      messageAsObject = { title: message as string }
    } else if (type === 'object' && message !== null && Object.keys(message as object).length > 0) {
      messageAsObject = message as Record<string, unknown>
    } else if (type === 'string' && (message as string) === '') {
      return
    } else {
      messageAsObject = { value: String(message) }
    }

    let sessionUrl: string | undefined
    try {
      sessionUrl = posthog.get_session_replay_url({ withTimestamp: true, timestampLookBack: 30 })
    } catch {
      // posthog not initialized
    }

    const { userId, accountId } = this.getContext()

    const payload = {
      timestamp: new Date().toISOString(),
      user: userId ?? 'unknown',
      accountId: accountId ?? 'unknown',
      url: typeof window !== 'undefined' ? window.location.href : 'unknown',
      sessionUrl,
      route: this.getRoute(),
      version: buildInfo.version,
      userAgent:
        typeof navigator !== 'undefined'
          ? ((navigator as unknown as Record<string, unknown>).userAgentData ?? navigator.userAgent)
          : 'unknown',
      browserType: detectBrowser(),
      environment: environment ?? 'local',
      level,
      sessionId: this.sessionKey,
      message: messageAsObject,
    }

    const serialized = this.truncateToken(safeStringify(payload))
    this.messagesToPost.push(serialized)

    if (environment === 'development') return

    if (this.messagesToPost.length > 25) this.flush()
  }

  private nextMessagesAsPayload(): string {
    const payload = this.messagesToPost.reduce((acc, cur) => `${acc}${cur}\n`, '')
    this.messagesToPost = []
    return payload
  }

  async flush() {
    if (environment === 'development') return
    if (this.messagesToPost.length === 0) return
    try {
      await fetch(BASE_URL, {
        method: 'POST',
        body: this.nextMessagesAsPayload(),
        headers: {
          'Content-Type': 'text/plain',
          'X-Sumo-Name': 'Website',
          'X-Sumo-Category': buildInfo.deployment.logTarget,
        },
      })
    } catch (err) {
      console.error(err)
    }
  }

  flushOnUnload() {
    if (environment === 'development') return
    try {
      if (navigator.sendBeacon && this.messagesToPost.length > 0) {
        const blob = new Blob([this.nextMessagesAsPayload()], { type: 'text/plain' })
        navigator.sendBeacon(BASE_URL, blob)
      }
    } catch {
      // Best-effort
    }
  }

  private truncateToken(payload: string): string {
    return payload.replace(
      /(eyJ[a-zA-Z0-9_-]{5,}\.eyJ[a-zA-Z0-9_-]{5,})\.[a-zA-Z0-9_-]*/gi,
      (_m, p1) => `${p1}.<sig>`,
    )
  }
}

export default new Logger()

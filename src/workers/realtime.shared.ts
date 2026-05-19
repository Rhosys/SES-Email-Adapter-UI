/// <reference lib="webworker" />
declare const self: SharedWorkerGlobalScope

const WS_BASE = (() => {
  const base = (import.meta.env.VITE_API_BASE_URL as string) ?? 'http://localhost:8787'
  return base.startsWith('https://')
    ? base.replace('https://', 'wss://')
    : base.replace('http://', 'ws://')
})()

const PING_INTERVAL_MS = 25_000
const MAX_RECONNECT_DELAY_MS = 30_000

const ports = new Set<MessagePort>()
let ws: WebSocket | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let keepAliveTimer: ReturnType<typeof setInterval> | null = null
let reconnectDelay = 1_000
let currentAccountId: string | null = null
let currentToken: string | null = null

function broadcast(msg: unknown): void {
  for (const port of ports) port.postMessage(msg)
}

function clearKeepAlive(): void {
  if (keepAliveTimer !== null) {
    clearInterval(keepAliveTimer)
    keepAliveTimer = null
  }
}

function connect(): void {
  if (!currentAccountId || !currentToken) return
  if (ws !== null && ws.readyState !== WebSocket.CLOSED) return

  const url = `${WS_BASE}/accounts/${currentAccountId}?token=${encodeURIComponent(currentToken)}`
  ws = new WebSocket(url)

  ws.onopen = () => {
    reconnectDelay = 1_000
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    broadcast({ type: 'status', connected: true })
    keepAliveTimer = setInterval(() => {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send('{"type":"ping"}')
      }
    }, PING_INTERVAL_MS)
  }

  ws.onmessage = (e: MessageEvent<string>) => {
    try {
      const data = JSON.parse(e.data) as { type: string }
      if (data.type === 'pong') return
      broadcast({ type: 'event', data })
    } catch {
      // ignore malformed frames
    }
  }

  ws.onclose = () => {
    clearKeepAlive()
    broadcast({ type: 'status', connected: false })
    scheduleReconnect()
  }

  ws.onerror = () => ws?.close()
}

function scheduleReconnect(): void {
  if (reconnectTimer !== null) return
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    connect()
  }, reconnectDelay)
  reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY_MS)
}

self.onconnect = (e: MessageEvent) => {
  const port = e.ports[0]
  ports.add(port)

  port.onmessage = (msg: MessageEvent) => {
    const data = msg.data as { type: string; accountId?: string; token?: string }

    if (data.type === 'init') {
      const accountChanged = data.accountId !== currentAccountId
      currentAccountId = data.accountId ?? currentAccountId
      currentToken = data.token ?? currentToken
      if (accountChanged && ws !== null && ws.readyState !== WebSocket.CLOSED) {
        // Close and reconnect under new account
        ws.close()
      } else {
        connect()
      }
    } else if (data.type === 'token') {
      currentToken = data.token ?? currentToken
      if (ws === null || ws.readyState === WebSocket.CLOSED) connect()
    } else if (data.type === 'close') {
      ports.delete(port)
      port.close()
      if (ports.size === 0) {
        clearKeepAlive()
        if (reconnectTimer !== null) {
          clearTimeout(reconnectTimer)
          reconnectTimer = null
        }
        ws?.close()
        ws = null
      }
    }
  }

  port.start()
  // Immediately tell the new port whether we're connected
  port.postMessage({ type: 'status', connected: ws?.readyState === WebSocket.OPEN })
}

import { OnMessageFn, PostMessageFn, Messages } from 'solid-devtools/bridge'
import { log } from '@solid-devtools/shared/utils'

export const DEVTOOLS_CONTENT_PORT = 'DEVTOOLS_CONTENT_PORT'
export const DEVTOOLS_CONNECTION_NAME = 'SOLID_DEVTOOLS'
export const POPUP_CONNECTION_NAME = 'SOLID_DEVTOOLS_POPUP'
export const PANEL_CONNECTION_NAME = 'SOLID_DEVTOOLS_PANEL'

export function createPortMessanger(port: chrome.runtime.Port): {
  postPortMessage: PostMessageFn
  onPortMessage: OnMessageFn
} {
  let listeners: {
    [K in keyof Messages]?: ((payload: Messages[K]) => void)[]
  } = {}

  let connected = true
  port.onDisconnect.addListener(port => {
    log('Port', port.name, 'disconnected')
    connected = false
    listeners = {}
    port.onMessage.removeListener(onMessage)
  })

  function onMessage(event: unknown) {
    if (!event || typeof event !== 'object') return
    const e = event as Record<PropertyKey, unknown>
    if (typeof e.id !== 'string') return
    listeners[e.id as keyof Messages]?.forEach(f => f(e.payload as never))
  }
  port.onMessage.addListener(onMessage)

  return {
    postPortMessage: (id, payload?: any) => {
      if (!connected) return
      port.postMessage({ id, payload })
    },
    onPortMessage: (id, handler) => {
      if (!connected) return () => {}
      let arr = listeners[id]
      if (!arr) arr = listeners[id] = []
      arr.push(handler)
      return () => (listeners[id] = arr!.filter(l => l !== handler) as any)
    },
  }
}

import { noop } from "@solid-primitives/utils"
import { LOG_MESSAGES, MESSAGE, OnMessageFn, PostMessageFn } from "@shared/messanger"
import { log } from "@shared/utils"

export const DEVTOOLS_CONTENT_PORT = "DEVTOOLS_CONTENT_PORT"

export function createPortMessanger(port: chrome.runtime.Port): {
  postPortMessage: PostMessageFn
  onPortMessage: OnMessageFn
} {
  let listeners: Partial<Record<MESSAGE, ((payload: any) => void)[]>> = {}

  let connected = true
  port.onDisconnect.addListener(port => {
    log("Port", port.name, "disconnected")
    connected = false
    listeners = {}
    port.onMessage.removeListener(onMessage)
  })

  function onMessage(event: unknown, port: chrome.runtime.Port) {
    if (!event || typeof event !== "object") return
    const e = event as Record<PropertyKey, unknown>
    if (typeof e.id !== "number") return
    LOG_MESSAGES && log("port message received:", MESSAGE[e.id], e.payload)
    listeners[e.id as MESSAGE]?.forEach(f => f(e.payload))
  }
  port.onMessage.addListener(onMessage)

  return {
    postPortMessage: (id, payload?: any) => {
      LOG_MESSAGES && log("port message posted:", MESSAGE[id], payload)
      if (!connected) return
      port.postMessage({ id, payload })
    },
    onPortMessage: (id, handler) => {
      if (!connected) return noop
      let arr = listeners[id]
      if (!arr) arr = listeners[id] = []
      arr.push(handler)
      return () => (listeners[id] = arr!.filter(l => l !== handler))
    },
  }
}

export function createRuntimeMessanger(): {
  postRuntimeMessage: PostMessageFn
  onRuntimeMessage: OnMessageFn
} {
  const listeners: Partial<Record<MESSAGE, ((payload: any) => void)[]>> = {}

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const id = message?.id as MESSAGE
    if (typeof id !== "number") return
    LOG_MESSAGES && log("runtime message received:", MESSAGE[id], message.payload)
    listeners[id]?.forEach(f => f(message.payload))
    // lines below are necessary to avoid "The message port closed before a response was received." errors.
    // https://github.com/mozilla/webextension-polyfill/issues/130
    sendResponse({})
    return true
  })

  return {
    onRuntimeMessage: (id, handler) => {
      let arr = listeners[id]
      if (!arr) arr = listeners[id] = []
      arr.push(handler)
      return () => (listeners[id] = arr!.filter(l => l !== handler))
    },
    postRuntimeMessage: (id, payload?: any) => {
      LOG_MESSAGES && log("runtime message posted:", MESSAGE[id], payload)
      chrome.runtime.sendMessage({ id, payload })
    },
  }
}

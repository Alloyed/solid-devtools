import { createEffect, createSignal } from "solid-js"
import { registerDebuggerPlugin, PluginFactory } from "@solid-devtools/debugger"
import {
  onWindowMessage,
  postWindowMessage,
  startListeningWindowMessages,
} from "@solid-devtools/shared/bridge"
import { warn } from "@solid-devtools/shared/utils"

startListeningWindowMessages()

const extensionAdapterFactory: PluginFactory = ({
  forceTriggerUpdate,
  rootsUpdates,
  handleComputationUpdates,
  handleSignalUpdates,
  setFocusedOwner,
  focusedState,
}) => {
  const [enabled, setEnabled] = createSignal(false)

  postWindowMessage("SolidOnPage")

  // update the graph only if the devtools panel is in view
  onWindowMessage("PanelVisibility", v => {
    if (!v) return setEnabled(false)
    const current = enabled()
    // the panel might have been closed and opened again—in that case we want to update the graph
    if (current) forceTriggerUpdate()
    else setEnabled(true)
  })
  onWindowMessage("ForceUpdate", forceTriggerUpdate)
  onWindowMessage("SetFocusedOwner", setFocusedOwner)

  // diff the roots, and send only the changed roots (edited, deleted, added)
  createEffect(() => {
    postWindowMessage("GraphUpdate", rootsUpdates())
  })

  // send the computation updates
  handleComputationUpdates(updates => {
    postWindowMessage("ComputationUpdates", updates)
  })

  // send the signal updates
  handleSignalUpdates(updates => {
    postWindowMessage("SignalUpdates", updates)
  })

  // send the focused owner details
  createEffect(() => {
    const details = focusedState().details
    if (details) {
      postWindowMessage("OwnerDetailsUpdate", details)
    }
  })

  return { enabled }
}

let registered = false

/**
 * Registers the extension adapter with the debugger.
 */
export function useExtensionAdapter() {
  if (registered) return warn("Extension adapter already registered")
  registered = true
  registerDebuggerPlugin(data => {
    const { enabled } = extensionAdapterFactory(data)
    return {
      enabled,
      observeComputations: enabled,
    }
  })
}

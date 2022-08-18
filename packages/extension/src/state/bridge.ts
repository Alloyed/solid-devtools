import { createEffect, createRoot, on } from "solid-js"
import { createRuntimeMessanger } from "../../shared/messanger"
import { handleComputationsUpdate, handleGraphUpdate, resetGraph } from "./graph"
import {
  focused,
  focusedRootId,
  handleSignalUpdates,
  updateDetails,
  handleGraphUpdate as detailsHandleGraphUpdate,
  setOnSignalSelect,
} from "./details"

export const { onRuntimeMessage, postRuntimeMessage } = createRuntimeMessanger()

// in development — force update the graph on load to work with hot reloading
if (import.meta.env.DEV) {
  postRuntimeMessage("ForceUpdate")
}

onRuntimeMessage("GraphUpdate", update => {
  handleGraphUpdate(update)
  detailsHandleGraphUpdate()
})

onRuntimeMessage("ResetPanel", () => {
  resetGraph()
  detailsHandleGraphUpdate()
})

onRuntimeMessage("ComputationUpdates", updates => {
  handleComputationsUpdate(updates.map(u => u.nodeId))
})

onRuntimeMessage("SignalUpdates", updates => {
  handleSignalUpdates(updates)
})

onRuntimeMessage("OwnerDetailsUpdate", details => {
  updateDetails(details)
})

createRoot(() => {
  // toggle selected owner
  createEffect(
    on(
      [focused, focusedRootId],
      ([owner, rootId]) => {
        const payload = owner && rootId ? { ownerId: owner.id, rootId } : null
        postRuntimeMessage("SetSelectedOwner", payload)
      },
      { defer: true },
    ),
  )

  // toggle selected signals
  setOnSignalSelect((id, selected) => {
    postRuntimeMessage("SetSelectedSignal", { id, selected })
  })
})

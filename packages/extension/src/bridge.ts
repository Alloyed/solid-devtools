import { createEffect, createRoot, on } from "solid-js"
import { Messages } from "@solid-devtools/shared/bridge"
import { NodeType } from "@solid-devtools/shared/graph"
import { createRuntimeMessanger } from "../shared/messanger"
import { structure, inspector, locator } from "@/state"

export const { onRuntimeMessage, postRuntimeMessage } = createRuntimeMessanger()

// in development — force update the graph on load to work with hot reloading
if (import.meta.env.DEV) {
  postRuntimeMessage("ForceUpdate")
}

onRuntimeMessage("GraphUpdate", update => {
  structure.updateStructure(update)
  inspector.handleGraphUpdate()
})

onRuntimeMessage("ResetPanel", () => {
  structure.clearRoots()
  inspector.handleGraphUpdate()
  locator.setOtherLocator(false)
  locator.setExtLocator(false)
})

onRuntimeMessage("ComputationUpdates", updates => {
  structure.handleComputationsUpdate(updates.map(u => u.id))
})

onRuntimeMessage("SignalUpdates", inspector.handleSignalUpdates)
onRuntimeMessage("SignalValue", update => {
  // updates the signal value but without causing it to highlight
  inspector.handleSignalUpdates([update], false)
})
onRuntimeMessage("PropsUpdate", inspector.handlePropsUpdate)

onRuntimeMessage("OwnerDetailsUpdate", details => {
  inspector.updateDetails(details)
})

// let visibility = false
// onRuntimeMessage("PanelVisibility", newVisibility => {
//   visibility = newVisibility
//   if (visibility) {
//     // panel
//   }
//   log("PanelVisibility", visibility)
// })

createRoot(() => {
  onRuntimeMessage("AdpLocatorMode", locator.setOtherLocator)
  createEffect(
    on(locator.extLocatorEnabled, state => postRuntimeMessage("ExtLocatorMode", state), {
      defer: true,
    }),
  )

  onRuntimeMessage("SendSelectedOwner", inspector.setSelectedNode)

  // toggle selected owner
  createEffect(
    on(
      [inspector.focused, inspector.focusedRootId],
      ([owner, rootId]) => {
        const payload = owner && rootId ? { nodeId: owner.id, rootId } : null
        postRuntimeMessage("SetSelectedOwner", payload)
      },
      { defer: true },
    ),
  )

  onRuntimeMessage("SetHoveredOwner", ({ state, nodeId }) => {
    // do not sync this state back to the adapter
    structure.toggleHoveredOwner(nodeId, state, false)
  })

  let initHighlight = true
  // toggle hovered html element
  createEffect<Messages["HighlightElement"] | undefined>(prev => {
    // tracks
    const { rootId, node, sync } = structure.hovered()
    const elId = inspector.hoveredElement()

    // skip initial value
    if (initHighlight) return (initHighlight = false) || undefined

    // handle component
    if (rootId && node && node.type === NodeType.Component) {
      // do not send the same message twice & skip state without the `sync` flag
      if ((prev && typeof prev === "object" && prev.nodeId === node.id) || !sync) return prev
      const payload = { rootId, nodeId: node.id }
      postRuntimeMessage("HighlightElement", payload)
      return payload
    }
    // handle element
    if (elId) {
      // do not send the same message twice
      if (typeof prev === "string" && prev === elId) return prev
      postRuntimeMessage("HighlightElement", elId)
      return elId
    }
    // no element or component
    if (prev) postRuntimeMessage("HighlightElement", null)
  })

  // toggle selected signals
  inspector.setOnInspectValue(payload => postRuntimeMessage("ToggleInspectedValue", payload))
})

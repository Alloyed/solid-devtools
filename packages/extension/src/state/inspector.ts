import { batch, createComputed, createRoot, createSelector, createSignal, untrack } from "solid-js"
import { createStore, produce } from "solid-js/store"
import { Writable } from "type-fest"
import { Mapped, NodeID, NodeType, SignalUpdate } from "@solid-devtools/shared/graph"
import { warn } from "@solid-devtools/shared/utils"
import { EncodedValue } from "@solid-devtools/shared/serialize"
import { Messages } from "@solid-devtools/shared/bridge"
import { untrackedCallback } from "@solid-devtools/shared/primitives"
import structure, { Structure } from "./structure"
import { createUpdatedSelector } from "./utils"

export namespace Inspector {
  export type Signal = {
    readonly type: NodeType.Signal | NodeType.Memo
    readonly name: string
    readonly id: NodeID
    readonly observers: NodeID[]
    readonly value: EncodedValue<boolean>
    readonly selected: boolean
  }

  export type Props = {
    readonly proxy: boolean
    readonly record: Record<
      string,
      { readonly selected: boolean; readonly value: EncodedValue<boolean> }
    >
  }

  export interface Details {
    readonly id: NodeID
    readonly name: string
    readonly type: NodeType
    readonly path: Structure.Node[]
    readonly signals: Record<NodeID, Signal>
    readonly props?: Props
    // TODO: more to come
  }
}

function reconcileSignals(
  newSignals: readonly Mapped.Signal[],
  signals: Record<NodeID, Inspector.Signal>,
): void {
  const prev = new Set(Object.keys(signals))
  for (const raw of newSignals) {
    const { id } = raw
    const signal = signals[id]
    if (signal) {
      // update signal observers
      signal.observers.length = 0
      signal.observers.push.apply(signal.observers, raw.observers)
      // update signal value
      reconcileValue(signal.value, raw.value)
      prev.delete(id)
    }
    // add new signal
    else signals[id] = createSignalNode(raw)
  }
  // remove signals
  for (const id of prev) delete signals[id]
}

function reconcileValue(proxy: EncodedValue<boolean>, next: EncodedValue<boolean>) {
  proxy.type = next.type
  // value is a literal, so we can just assign it
  if (next.value) proxy.value = next.value
  else delete proxy.value
  if (next.children) {
    // add new children
    if (!proxy.children) (proxy as EncodedValue<boolean>).children = next.children
    // reconcile children
    else {
      for (const key of Object.keys(proxy.children) as never[]) {
        // remove child
        if (!next.children[key]) delete proxy.children[key]
        // update child
        else reconcileValue(proxy.children[key], next.children[key])
      }
      for (const key of Object.keys(next.children) as never[]) {
        // add child
        if (!proxy.children[key]) proxy.children[key] = next.children[key]
      }
    }
  }
  // remove children
  else delete proxy.children
}

function createSignalNode(raw: Readonly<Mapped.Signal>): Inspector.Signal {
  return { ...raw, selected: false }
}

function reconcileProps(proxy: Writable<Inspector.Props>, raw: Mapped.Props): void {
  const record = proxy.record
  const newRecord = raw.record
  proxy.proxy = raw.proxy
  // the props cannot be deleted/added, so we can just update them
  for (const [key, prop] of Object.entries(record)) {
    const newProp = newRecord[key]
    if (!newProp) delete record[key]
    else reconcileValue(prop.value, newProp)
  }
  for (const [key, newProp] of Object.entries(newRecord)) {
    if (!record[key]) record[key] = { value: newProp, selected: false }
  }
}

function createDetails(
  node: Structure.Node,
  raw: Readonly<Mapped.OwnerDetails>,
): Inspector.Details {
  const signals = raw.signals.reduce((signals, signal) => {
    signals[signal.id] = createSignalNode(signal)
    return signals
  }, {} as Inspector.Details["signals"])
  const path = structure.getNodePath(node)
  const details: Writable<Inspector.Details> = {
    id: raw.id,
    name: raw.name,
    type: raw.type,
    path,
    signals,
  }
  if (raw.props) {
    details.props = {
      proxy: raw.props.proxy,
      record: Object.entries(raw.props.record).reduce((props, [propName, value]) => {
        props[propName] = { value, selected: false }
        return props
      }, {} as Inspector.Props["record"]),
    }
  }
  return details
}

function reconcileDetails(
  node: Structure.Node,
  proxy: Writable<Inspector.Details>,
  raw: Readonly<Mapped.OwnerDetails>,
): void {
  // update path
  const path = structure.getNodePath(node)
  proxy.path.length = 0
  proxy.path.push.apply(proxy.path, path)
  // update signals
  reconcileSignals(raw.signals, proxy.signals)
  // update props
  if (raw.props) reconcileProps(proxy.props!, raw.props)
}

const inspector = createRoot(() => {
  const [inspectedNode, setInspectedNode] = createSignal<Structure.Node | null>(null)
  const [state, setDetails] = createStore<{ value: Inspector.Details | null }>({ value: null })
  const details = () => state.value

  const isNodeInspected = createSelector<NodeID | null, NodeID>(() => inspectedNode()?.id ?? null)

  const setInspected: (data: Structure.Node | null | Messages["SendSelectedOwner"]) => void =
    untrackedCallback(data => {
      batch(() => {
        if (!data) {
          setInspectedNode(null)
          setDetails({ value: null })
          return
        }

        const currentNode = inspectedNode()
        if ("name" in data) {
          if (currentNode && data.id === currentNode.id) return
          setInspectedNode(data)
          setDetails({ value: null })
        } else {
          if (currentNode && data === currentNode.id) return
          const node = structure.findNode(data)
          if (!node) return
          setInspectedNode(node)
          setDetails({ value: null })
        }
      })
    })

  // clear the inspector when the inspected node is removed
  createComputed(() => {
    structure.structure()
    untrack(() => {
      const node = inspectedNode()
      if (!node) return
      structure.findNode(node.id) || setInspectedNode(null)
    })
  })

  const updateDetails = untrackedCallback((raw: Mapped.OwnerDetails) => {
    const node = inspectedNode()
    if (!node) return warn("updateDetails: no node is being inspected")

    setDetails("value", prev =>
      prev === null
        ? createDetails(node, raw)
        : produce<Writable<Inspector.Details>>(proxy => reconcileDetails(node, proxy, raw))(prev),
    )
  })

  const [isUpdated, addUpdated, clearUpdated] = createUpdatedSelector()

  const handleSignalUpdates = untrackedCallback((updates: SignalUpdate[], isUpdate = true) => {
    if (!details()) return
    batch(() => {
      isUpdate && addUpdated(updates.map(u => u.id))
      setDetails(
        "value",
        "signals",
        produce(proxy => {
          for (const update of updates) {
            const signal = proxy[update.id]
            if (!signal) return
            reconcileValue(signal.value, update.value)
          }
        }),
      )
    })
  })

  const handlePropsUpdate = untrackedCallback((props: Mapped.Props) => {
    if (!details()?.props) return
    setDetails(
      "value",
      "props",
      produce(proxy => reconcileProps(proxy!, props)),
    )
  })

  /** variable for a callback in bridge.ts */
  let onInspectValue: ((payload: Messages["ToggleInspectedValue"]) => void) | undefined
  const setOnInspectValue = (fn: typeof onInspectValue) => (onInspectValue = fn)

  function togglePropFocus(id: string, selected?: boolean): void {
    setDetails("value", "props", "record", id, "selected", p => (selected = selected ?? !p))
    onInspectValue!({ type: "prop", id, selected: selected! })
  }
  function toggleSignalFocus(id: NodeID, selected?: boolean) {
    setDetails("value", "signals", id, "selected", p => (selected = selected ?? !p))
    onInspectValue!({ type: "signal", id, selected: selected! })
  }

  //
  // HOVERED ELEMENT
  //
  const [hoveredElement, setHoveredElement] = createSignal<string | null>(null)

  function toggleHoveredElement(id: NodeID, selected?: boolean) {
    setHoveredElement(p => (p === id ? (selected ? id : null) : selected ? id : p))
  }

  return {
    inspectedNode,
    details,
    setInspectedNode: setInspected,
    isNodeInspected,
    isUpdated,
    clearUpdated,
    updateDetails,
    handleSignalUpdates,
    handlePropsUpdate,
    toggleSignalFocus,
    togglePropFocus,
    setOnInspectValue,
    hoveredElement,
    toggleHoveredElement,
  }
})
export default inspector

import { batch, createEffect, createSignal, on } from 'solid-js'
import { createContextProvider } from '@solid-primitives/context'
import { NodeID, NodeType, RootsUpdates } from '@solid-devtools/shared/graph'
import type { Messages } from '@solid-devtools/shared/bridge'
import createStructure from './modules/structure'
import createInspector from './modules/inspector'

type ListenersFromPayloads<T extends Record<string, any>> = {
  [K in keyof Pick<
    T,
    keyof T extends infer R ? (R extends keyof T ? (R extends string ? R : never) : never) : never
  > as `on${K}`]: T[K] extends [void] ? () => void : (payload: T[K]) => void
}

interface ClientListenerPayloads {
  Inspect: Messages['ToggleInspected']
  DevtoolsLocatorStateChange: boolean
  HighlightElementChange: Messages['HighlightElement']
}
export type ClientListeners = ListenersFromPayloads<ClientListenerPayloads>

interface DevtoolsListenerPayloads {
  ResetPanel: void
  SetInspectedDetails: Messages['SetInspectedDetails']
  StructureUpdate: RootsUpdates | null
  ComputationUpdates: Messages['ComputationUpdates']
  InspectorUpdate: Messages['InspectorUpdate']
  ClientLocatorModeChange: boolean
  ClientHoveredComponent: Messages['ClientHoveredComponent']
  ClientInspectedNode: Messages['ClientInspectedNode']
}
export type DevtoolsListeners = ListenersFromPayloads<DevtoolsListenerPayloads>

export class Controller {
  private listeners!: DevtoolsListeners

  constructor(public clientListeners: ClientListeners) {}

  connectDevtools(devtoolsListeners: DevtoolsListeners) {
    if (this.listeners) {
      throw new Error('Devtools already connected!')
    }
    this.listeners = devtoolsListeners
  }

  updateStructure(update: RootsUpdates | null) {
    this.listeners.onStructureUpdate(update)
  }
  updateComputation(computationUpdate: Messages['ComputationUpdates']) {
    this.listeners.onComputationUpdates(computationUpdate)
  }
  updateInspector(inspectorUpdate: Messages['InspectorUpdate']) {
    this.listeners.onInspectorUpdate(inspectorUpdate)
  }
  setInspectedDetails(ownerDetails: Messages['SetInspectedDetails']) {
    this.listeners.onSetInspectedDetails(ownerDetails)
  }
  resetPanel() {
    this.listeners.onResetPanel()
  }
  setLocatorState(active: boolean) {
    this.listeners.onClientLocatorModeChange(active)
  }
  setHoveredNode(node: Messages['ClientHoveredComponent']) {
    this.listeners.onClientHoveredComponent(node)
  }
  setInspectedNode(node: Messages['ClientInspectedNode']) {
    this.listeners.onClientInspectedNode(node)
  }
}

const [Provider, useControllerCtx] = createContextProvider((props: { controller: Controller }) => {
  const { controller } = props

  const [devtoolsLocatorEnabled, setDevtoolsLocatorState] = createSignal(false)
  const [clientLocatorEnabled, setClientLocator] = createSignal(false)
  const [clientHoveredNodeId, setClientHoveredId] = createSignal<NodeID | null>(null)

  const locatorEnabled = () => devtoolsLocatorEnabled() || clientLocatorEnabled()

  function setClientLocatorState(enabled: boolean) {
    batch(() => {
      setClientLocator(enabled)
      if (!enabled) setClientHoveredId(null)
    })
  }

  const structure = createStructure({
    clientHoveredNodeId,
  })

  const inspector = createInspector({
    findNode: structure.findNode,
    getNodePath: structure.getNodePath,
  })

  controller.connectDevtools({
    onResetPanel() {
      batch(() => {
        structure.updateStructure(null)
        setClientLocatorState(false)
        setDevtoolsLocatorState(false)
      })
    },
    onSetInspectedDetails(ownerDetails) {
      inspector.setDetails(ownerDetails)
    },
    onClientHoveredComponent({ nodeId, state }) {
      setClientHoveredId(p => {
        if (state) return nodeId ?? p
        return p && p === nodeId ? null : p
      })
    },
    onClientInspectedNode(node) {
      inspector.setInspectedNode(node)
    },
    onClientLocatorModeChange(active) {
      setClientLocatorState(active)
    },
    onComputationUpdates(updated) {
      updated.forEach(({ id }) => structure.emitComputationUpdate(id))
    },
    onStructureUpdate(update) {
      batch(() => {
        structure.updateStructure(update)
        inspector.handleStructureChange()
      })
    },
    onInspectorUpdate(payload) {
      inspector.update(payload)
    },
  })

  const client = controller.clientListeners

  // send devtools locator state
  createEffect(
    on(
      devtoolsLocatorEnabled,
      enabled => {
        client.onDevtoolsLocatorStateChange(enabled)
      },
      { defer: true },
    ),
  )

  // send inspected node/value/prop/signal
  inspector.setOnInspectedHandler(payload => {
    if (payload.type === 'node') {
      const node = payload.data
      const nodePayload = node
        ? { nodeId: node.id, rootId: structure.getParentRoot(node).id }
        : null
      client.onInspect({ type: 'node', data: nodePayload })
    } else {
      client.onInspect(payload)
    }
  })

  // highlight hovered element
  createEffect(
    on(
      [structure.extHovered, inspector.hoveredElement],
      ([hovered, elId], _, prev: string | { rootId: NodeID; nodeId: NodeID } | undefined) => {
        // handle component
        if (hovered && hovered.type === NodeType.Component) {
          if (typeof prev === 'object' && prev.nodeId === hovered.id) return prev

          const rootId = structure.getParentRoot(hovered).id
          const payload = { rootId, nodeId: hovered.id }
          client.onHighlightElementChange(payload)
          return payload
        }
        // handle element
        if (elId) {
          if (typeof prev === 'string' && prev === elId) return prev
          client.onHighlightElementChange({ elementId: elId })
          return elId
        }
        // no element or component
        if (prev) client.onHighlightElementChange(null)
      },
      { defer: true },
    ),
  )

  return {
    isNodeHovered: structure.isHovered,
    locatorEnabled,
    inspectedDetails: inspector.details,
    structureState: structure.state,
    inspectedNode: inspector.inspectedNode,
    isNodeInspected: inspector.isNodeInspected,
    setLocatorState: setDevtoolsLocatorState,
    setInspectedNode: inspector.setInspectedNode,
    toggleHoveredNode: structure.toggleHoveredNode,
    listenToComputationUpdate: structure.listenToComputationUpdate,
    inspector,
  }
})

export { Provider }

export function useController() {
  const ctx = useControllerCtx()
  if (!ctx) {
    throw new Error('ControllerContext was not provided')
  }
  return ctx
}

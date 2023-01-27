import { useController } from '@/controller'
import { Scrollable } from '@/ui'
import { OwnerName } from '@/ui/components/Owner'
import { NodeID, SerializedDGraph } from '@solid-devtools/debugger/types'
import { assignInlineVars } from '@vanilla-extract/dynamic'
import { Component, createContext, createMemo, For, Show, useContext } from 'solid-js'
import { ReadonlyDeep } from 'type-fest'
import { createDependencyGraph, Dgraph } from './dgraph'
import * as styles from './graph.css'
import { depthVar } from './graph.css'

const DgraphContext = createContext<Dgraph.Module>()

export const useDgraph = () => {
  const ctx = useContext(DgraphContext)
  if (!ctx) throw new Error('Dgraph context not found')
  return ctx
}

function calculateNodeOrder(
  graph: SerializedDGraph.Graph,
  inspectedId: NodeID,
  inspectedNode: SerializedDGraph.Node,
) {
  const depthGroups = new Map<number, NodeID[]>([[inspectedNode.depth, [inspectedId]]])

  // breadth-first traversal
  // direct observers will be included closest to the inspected node
  // and further observers will be included further away

  // observers and sources are checked in parallel
  // by one list of ids per cycle
  // and the cycle is repeated until all ids are checked

  // so that the closer the node is to the inspected node in the d-graph
  // (no matter if it's an observer or a source)
  // the closer it will be to the inspected node in the list
  // and more likely to be on the correct side of the inspected node
  // (sources are added to the top of the list, observers to the bottom)

  const flowOrder = [inspectedId]
  const checkedObservers = new Set(flowOrder)
  const checkedSources = new Set(flowOrder)

  const toCheck: [sources: (readonly NodeID[])[], observers: (readonly NodeID[])[]] = [
    inspectedNode.sources ? [inspectedNode.sources] : [],
    inspectedNode.observers ? [inspectedNode.observers] : [],
  ]
  let index = 0
  let checkingObservers: 0 | 1 = 0
  let ids = toCheck[checkingObservers][0]
  while (ids) {
    for (const id of ids) {
      const node = graph[id]
      if (!node) continue

      const inSources = checkedSources.has(id)
      const inObservers = checkedObservers.has(id)

      !inSources && node.sources && node.sources.length && toCheck[0].push(node.sources)
      !inObservers && node.observers && node.observers.length && toCheck[1].push(node.observers)

      if (!inSources && !inObservers) {
        flowOrder[checkingObservers ? 'push' : 'unshift'](id)
        const depthList = depthGroups.get(node.depth)
        if (depthList) depthList.push(id)
        else depthGroups.set(node.depth, [id])
      }

      checkingObservers
        ? inObservers || checkedObservers.add(id)
        : inSources || checkedSources.add(id)
    }

    index += checkingObservers
    ids = toCheck[(checkingObservers = (checkingObservers ^ 1) as 0 | 1)][index]
    if (!ids) {
      index += checkingObservers
      ids = toCheck[(checkingObservers = (checkingObservers ^ 1) as 0 | 1)][index]
    }
  }

  // sort nodes by depth (horizontal alignment)
  const depthOrder = Array.from(depthGroups.entries()).sort(([a], [b]) => a - b)
  const depthMap: Record<NodeID, number> = {}
  for (let i = 0; i < depthOrder.length; i++) {
    // eslint-disable-next-line @typescript-eslint/no-shadow
    const ids = depthOrder[i]![1]
    for (const id of ids) depthMap[id] = i
  }

  return { flowOrder, depthMap }
}

const GraphNode: Component<{
  id: NodeID
  depth: number
  node: SerializedDGraph.Node
  isInspected: boolean
}> = props => {
  const { id } = props
  return (
    <div class={styles.node} style={assignInlineVars({ [depthVar]: props.depth + '' })}>
      {/* {NODE_TYPE_NAMES[props.node.type]}: {props.node.name}
      {id} */}
      <OwnerName name={props.node.name} type={props.node.type} />
    </div>
  )
}

const DgraphView: Component = () => {
  const ctx = useController()
  const dgraph = createDependencyGraph()

  const order = createMemo<ReadonlyDeep<ReturnType<typeof calculateNodeOrder>> | null>(
    (p = null) => {
      const graph = dgraph.graph()
      if (!graph) return null

      const inspectedId = ctx.inspectedNodeId()!
      const inspectedNode = graph[inspectedId]
      if (!inspectedNode) return p
      if (!inspectedNode.observers && !inspectedNode.sources) return null

      return calculateNodeOrder(graph, inspectedId, inspectedNode)
    },
  )

  return (
    <Scrollable>
      <DgraphContext.Provider value={dgraph}>
        <Show when={dgraph.graph()} fallback="NO DEPENDENCY GRAPH">
          <div class={styles.container}>
            <div class={styles.nodes}>
              <For each={order()?.flowOrder}>
                {id => (
                  <GraphNode
                    id={id}
                    depth={order()!.depthMap[id]!}
                    node={dgraph.graph()![id]!}
                    isInspected={ctx.isNodeInspected(id)}
                  />
                )}
              </For>
            </div>
          </div>
          <h3>Dependency Graph</h3>
          <pre>{JSON.stringify(dgraph.graph(), null, 2)}</pre>
        </Show>
      </DgraphContext.Provider>
    </Scrollable>
  )
}

export default DgraphView

import { getSdtId } from '../main/id'
import { NodeID, Solid } from '../main/types'
import {
  observeComputationUpdate,
  observeValueUpdate,
  removeComputationUpdateObserver,
  removeValueUpdateObserver,
} from '../main/update'
import { getNodeName, getNodeType, isSolidOwner } from '../main/utils'
import { ComputationNodeType, NodeType } from '../types'

export namespace DGraph {
  export type Depth = `${NodeID}:${number}` | undefined

  export type NodeBase = {
    name: string
    depth: Depth
  }

  export type Signal = NodeBase & {
    type: NodeType.Signal
    observers: readonly NodeID[] | undefined
    sources?: undefined
  }

  export type Computation = NodeBase & {
    type: Exclude<ComputationNodeType, NodeType.Memo>
    sources: readonly NodeID[] | undefined
    observers?: undefined
  }

  export type Memo = NodeBase & {
    type: NodeType.Memo
    sources: readonly NodeID[] | undefined
    observers: readonly NodeID[] | undefined
  }

  export type Node = Signal | Computation | Memo

  export type Graph = Record<NodeID, Node>
}

const $DGRAPH = Symbol('dependency-graph')

let Graph: DGraph.Graph
let VisitedSources: Set<Solid.Signal>
let VisitedObservers: Set<Solid.Computation>
let DepthMap: Record<NodeID, DGraph.Depth>
let OnNodeUpdate: (node: Solid.Computation | Solid.Memo | Solid.Signal) => void
export type OnNodeUpdate = typeof OnNodeUpdate

function observeNodeUpdate(
  node: Solid.Computation | Solid.Memo | Solid.Signal,
  handler: VoidFunction,
) {
  if (isSolidOwner(node)) observeComputationUpdate(node, handler, $DGRAPH)
  else observeValueUpdate(node, handler, $DGRAPH)
}
function unobserveNodeUpdate(node: Solid.Computation | Solid.Memo | Solid.Signal) {
  if (isSolidOwner(node)) removeComputationUpdateObserver(node, $DGRAPH)
  else removeValueUpdateObserver(node, $DGRAPH)
}

function addNodeToGraph(node: Solid.Signal | Solid.Memo | Solid.Computation) {
  const id = getSdtId(node)
  if (Graph[id]) return Graph[id]!

  // observe each mapped node, to update the graph when it changes
  const onNodeUpdate = OnNodeUpdate
  observeNodeUpdate(node, () => onNodeUpdate(node))

  return (Graph[id] = {
    name: getNodeName(node),
    type: getNodeType(node) as Exclude<ComputationNodeType, NodeType.Memo>,
    depth: lookupDepth(node),
    sources: (node as Solid.Memo).sources ? (node as Solid.Memo).sources!.map(getSdtId) : undefined,
    observers: (node as Solid.Memo).observers
      ? (node as Solid.Memo).observers!.map(getSdtId)
      : undefined,
  } as DGraph.Node)
}

function visitSource(node: Solid.Signal | Solid.Memo) {
  if (VisitedSources.has(node)) return
  VisitedSources.add(node)
  addNodeToGraph(node)
  if ('sources' in node && node.sources) node.sources.forEach(visitSource)
}

function visitObserver(node: Solid.Computation | Solid.Memo) {
  if (VisitedObservers.has(node)) return
  VisitedObservers.add(node)
  addNodeToGraph(node)
  if ('observers' in node && node.observers) node.observers.forEach(visitObserver)
}

function lookupDepth(node: Solid.Owner | Solid.Signal, i = 0): DGraph.Depth {
  const id = getSdtId(node)

  let owner: Solid.Owner | undefined | null
  // signal
  if (!('owned' in node)) owner = node.graph
  // root
  else if (!('fn' in node) && !node.owner) return `${id}:${i}`
  // computation
  else owner = node.owner

  return id in DepthMap
    ? DepthMap[id]
    : (DepthMap[id] = owner ? lookupDepth(owner, i + 1) : undefined)
}

export function collectDependencyGraph(
  node: Solid.Computation | Solid.Memo | Solid.Signal,
  config: { onNodeUpdate: OnNodeUpdate },
) {
  Graph = {}
  const visitedSources = (VisitedSources = new Set())
  const visitedObservers = (VisitedObservers = new Set())
  DepthMap = {}
  OnNodeUpdate = config.onNodeUpdate

  addNodeToGraph(node)
  if ('sources' in node && node.sources) node.sources.forEach(visitSource)
  if ('observers' in node && node.observers) node.observers.forEach(visitObserver)

  const result = Graph

  // clear all listeners
  const clearListeners = () => {
    visitedSources.forEach(unobserveNodeUpdate)
    visitedObservers.forEach(unobserveNodeUpdate)
    unobserveNodeUpdate(node)
  }

  Graph = VisitedObservers = VisitedSources = DepthMap = OnNodeUpdate = undefined!

  return { graph: result, clearListeners }
}

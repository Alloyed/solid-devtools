import { createRoot, createSignal, getOwner, onCleanup } from "solid-js"
import { mutateFilter, pushToArrayProp } from "@solid-devtools/shared/utils"
import {
  MappedOwner,
  MappedSignal,
  GraphOwner,
  GraphSignal,
  NodeID,
} from "@solid-devtools/shared/graph"

const dispose = (o: { dispose?: VoidFunction }) => o.dispose?.()
const disposeAll = (list: { dispose?: VoidFunction }[]) => list.forEach(dispose)
function deleteKey<K extends PropertyKey>(this: { [_ in K]?: unknown }, key: K) {
  delete this[key]
}

/**
 * Reconciles an array by mutating it. Diffs items by "id" prop. And uses {@link mapFunc} for creating new items.
 * Use for dynamic arrays that can change entirely. Like sources or observers.
 */
function reconcileArrayByIds<T extends { id: NodeID }>(
  ids: readonly NodeID[],
  array: T[],
  mapFunc: (id: NodeID, array: T[]) => void,
): void {
  const removed: T[] = []
  const intersection: NodeID[] = []
  let id: NodeID
  for (const item of array) {
    id = item.id
    if (ids.includes(id)) intersection.push(id)
    else removed.push(item)
  }
  mutateFilter(array, o => !removed.includes(o))
  for (id of ids) intersection.includes(id) || mapFunc(id, array)
}

const signalsUpdated = new Set<NodeID>()
const ownersUpdated = new Set<GraphOwner>()

// TODO: when the roots should be removed from here?
const NodeMap: Record<
  NodeID,
  {
    owners: Record<NodeID, GraphOwner>
    signals: Record<NodeID, GraphSignal>
  }
> = {}

// TODO: map source/observers length separately, as these won't always resolve
let sourcesToAddLazy: Record<NodeID, ((source: GraphSignal) => void)[]> = {}
let observersToAddLazy: Record<NodeID, ((source: GraphOwner) => void)[]> = {}

export function updateSignal(rootId: NodeID, id: NodeID, newValue: unknown): void {
  const node = NodeMap[rootId].signals[id]
  if (node) {
    node.setValue(newValue)
    node.setUpdate(true)
    signalsUpdated.add(id)
  }
}

export function disposeAllNodes() {
  for (const { owners, signals } of Object.values(NodeMap)) {
    disposeAll(Object.values(owners))
    disposeAll(Object.values(signals))
  }
}

export function removeRootFromMap(id: NodeID) {
  delete NodeMap[id]
}

export function afterGraphUpdate() {
  // sources and observers can be added lazily only during one reconciliation
  sourcesToAddLazy = {}
  observersToAddLazy = {}
  signalsUpdated.clear()
  ownersUpdated.clear()
}

export function findOwnerRootId(owner: GraphOwner): NodeID {
  for (const rootId in NodeMap) {
    const owners = NodeMap[rootId].owners
    for (const id in owners) {
      if (id === owner.id + "") return rootId
    }
  }
  throw "ROOT_ID_NOT_FOUND"
}

const addSignalToMap = (rootId: NodeID, node: GraphSignal) => {
  const id = node.id
  const signals = NodeMap[rootId].signals
  signals[id] = node
  onCleanup(deleteKey.bind(signals, id))
  const toAdd = sourcesToAddLazy[id]
  if (toAdd) {
    toAdd.forEach(f => f(node))
    delete sourcesToAddLazy[id]
  }
}
const addOwnerToMap = (rootId: NodeID, node: GraphOwner) => {
  const id = node.id
  const owners = NodeMap[rootId].owners
  owners[id] = node
  onCleanup(deleteKey.bind(owners, id))
  const toAdd = observersToAddLazy[id]
  if (toAdd) {
    toAdd.forEach(f => f(node))
    delete observersToAddLazy[id]
  }
}

function mapObserver(rootId: NodeID, id: NodeID, mutable: GraphOwner[]) {
  const node = NodeMap[rootId].owners[id]
  if (node) mutable.push(node)
  else pushToArrayProp(observersToAddLazy, id, owner => mutable.push(owner))
}

/**
 * maps the raw owner tree to be placed into the reactive graph store
 * this is for new branches – owners that just have been created
 */
export function mapNewOwner(rootId: NodeID, owner: Readonly<MappedOwner>): GraphOwner {
  // wrap with root that will be disposed together with the rest of the tree
  // TODO do we need disposing?
  return createRoot(dispose => {
    const children: GraphOwner[] = []
    const node: GraphOwner = { ...owner, children, dispose }
    addOwnerToMap(rootId, node)

    // TODO: remove mapping signals
    // node.signals.push(...owner.signals.map(createSignalNode))
    node.children.push(...owner.children.map(child => mapNewOwner(rootId, child)))
    // if (owner.signal) node.signal = createSignalNode(rootId, owner.signal)

    onCleanup(disposeAll.bind(void 0, node.children))
    // onCleanup(disposeAll.bind(void 0, node.signals))

    return node
  })
}

export function mapNewRoot(rootId: NodeID, owner: Readonly<MappedOwner>): GraphOwner {
  NodeMap[rootId] = { owners: {}, signals: {} }
  return mapNewOwner(rootId, owner)
}

/**
 * Sync "createSignalNode" is meant to be used when creating new owner node,
 * when there is a reactive root that will take care of cleaning up the value signal
 */
function createSignalNode(rootId: NodeID, raw: Readonly<MappedSignal>): GraphSignal {
  if (!getOwner()) throw "This should be executed under a root"
  const [value, setValue] = createSignal(raw.value)
  const [updated, setUpdate] = createSignal(false)
  const observers: GraphOwner[] = []
  const { id } = raw
  const node: GraphSignal = {
    id,
    name: raw.name,
    observers,
    get value() {
      return value()
    },
    get updated() {
      return updated()
    },
    setValue,
    setUpdate,
  }
  addSignalToMap(rootId, node)
  raw.observers.forEach(observerId => mapObserver(rootId, observerId, observers))

  return node
}

/**
 * Async "createSignalNode" is meant to be used when reconciling the tree,
 * when there is no reactive root to take care of cleaning up the value signal
 */
function createSignalNodeAsync(rootId: NodeID, raw: Readonly<MappedSignal>): GraphSignal {
  return createRoot(dispose => Object.assign(createSignalNode(rootId, raw), { dispose }))
}

/**
 * reconciles the existing reactive owner tree,
 * looking for changes and applying them granularely.
 */
function reconcileChildren(
  rootId: NodeID,
  newChildren: MappedOwner[],
  children: GraphOwner[],
): void {
  const length = children.length,
    newLength = newChildren.length,
    childrenExtended = newLength > length

  let i = 0,
    limit = childrenExtended ? length : newLength,
    node: GraphOwner,
    mapped: MappedOwner

  for (; i < limit; i++) {
    node = children[i]
    mapped = newChildren[i]
    if (node.id === mapped.id) reconcileNode(rootId, mapped, node)
    else {
      // dispose old, map new child
      node.dispose()
      children[i] = mapNewOwner(rootId, mapped)
    }
  }

  if (childrenExtended) {
    for (; i < newLength; i++) {
      // dispose old, map new child
      children[i]?.dispose()
      children[i] = mapNewOwner(rootId, newChildren[i])
    }
  } else {
    // dispose old
    disposeAll(children.splice(i))
  }
}

// function reconcileSignals(newSignals: readonly MappedSignal[], signals: GraphSignal[]): void {
//   if (!newSignals.length && !signals.length) return
//   const removed: NodeID[] = []
//   const intersection: MappedSignal[] = []
//   for (const signal of signals) {
//     const newSignal = newSignals.find(compareId.bind(signal))
//     if (newSignal) {
//       // reconcile signal observers
//       reconcileArrayByIds(newSignal.observers, signal.observers, mapObserver)
//       intersection.push(newSignal)
//     } else removed.push(signal.id)
//   }
//   // remove
//   if (removed.length) mutateFilter(signals, o => !removed.includes(o.id))
//   // map new signals
//   for (const raw of newSignals) {
//     if (!intersection.includes(raw)) signals.push(createSignalNodeAsync(raw))
//   }
// }

export function reconcileNode(rootId: NodeID, mapped: MappedOwner, node: GraphOwner): void {
  reconcileChildren(rootId, mapped.children, node.children)
  // TODO: remove mapping signals
  // reconcileSignals(mapped.signals, node.signals)
  // reconcileArrayByIds(mapped.sources, node.sources, mapSource.bind(void 0, rootId))

  // reconcile signal observers
  // if (mapped.signal) {
  //   if (!node.signal) node.signal = createSignalNodeAsync(rootId, mapped.signal)
  //   else
  //     reconcileArrayByIds(
  //       mapped.signal.observers,
  //       node.signal.observers,
  //       mapObserver.bind(void 0, rootId),
  //     )
  // }
}

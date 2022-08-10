import { resolveElements } from "@solid-primitives/refs"
import {
  MappedOwner,
  NodeType,
  SolidOwner,
  MappedSignal,
  SolidSignal,
  MappedComponent,
  OwnerDetails,
} from "@solid-devtools/shared/graph"
import { ComputationUpdateHandler, SignalUpdateHandler } from "./batchUpdates"
import {
  getNodeName,
  getNodeType,
  getSafeValue,
  isSolidComputation,
  isSolidMemo,
  markNodeID,
  markNodesID,
  markOwnerName,
  markOwnerType,
} from "./utils"
import { observeComputationUpdate, observeValueUpdate, removeValueUpdateObserver } from "./update"

// Globals set before each walker cycle
let FocusedID: number | null = null
let RootID: number
let OnSignalUpdate: SignalUpdateHandler
let OnComputationUpdate: ComputationUpdateHandler
let ObserveComputations: boolean
let GatherComponents: boolean
let Components: MappedComponent[] = []
let FocusedOwner: SolidOwner | null = null
let FocusedOwnerDetails: OwnerDetails | null = null

const WALKER = Symbol("walker")

function observeComputation(owner: SolidOwner, id: number) {
  if (ObserveComputations && isSolidComputation(owner))
    observeComputationUpdate(owner, OnComputationUpdate.bind(void 0, id))
}

function observeValue(node: SolidSignal) {
  const id = markNodeID(node)
  // OnSignalUpdate will change
  const handler = OnSignalUpdate
  observeValueUpdate(node, (value, oldValue) => handler({ id, value, oldValue }), WALKER)
}

function createSignalNode(node: SolidSignal): MappedSignal {
  return {
    type: getNodeType(node) as NodeType.Memo | NodeType.Signal,
    name: getNodeName(node),
    id: markNodeID(node),
    observers: markNodesID(node.observers),
    value: getSafeValue(node.value),
  }
}

function mapOwnerSignals(owner: SolidOwner): MappedSignal[] {
  if (!owner.sourceMap) return []
  return Object.values(owner.sourceMap).map(raw => {
    observeValue(raw)
    return createSignalNode(raw)
  })
}

function mapOwnerMemos(owner: SolidOwner): MappedSignal[] {
  const memos: MappedSignal[] = []
  if (!owner.owned) return memos
  owner.owned.forEach(child => {
    if (!isSolidMemo(child)) return
    observeValue(child)
    memos.push(createSignalNode(child))
  })
  return memos
}

export function clearOwnerObservers(owner: SolidOwner): void {
  if (owner.sourceMap)
    Object.values(owner.sourceMap).forEach(node => removeValueUpdateObserver(node, WALKER))
  if (owner.owned) owner.owned.forEach(node => removeValueUpdateObserver(node, WALKER))
}

function collectOwnerDetails(owner: SolidOwner): void {
  // get owner path
  const path: number[] = []
  let current: SolidOwner | null = owner.owner
  while (current) {
    // * after we flatten the tree, we'll know the length of the path — no need to use unshift then
    path.unshift(markNodeID(current))
    current = current.owner
  }

  // get signals and memos
  const signals = mapOwnerSignals(owner)
  signals.push.apply(signals, mapOwnerMemos(owner))

  const details: OwnerDetails = {
    // id, name and type are already set in mapOwner
    id: owner.sdtId!,
    name: owner.sdtName!,
    type: owner.sdtType!,
    path,
    signals,
  }

  if (isSolidComputation(owner)) {
    details.value = getSafeValue(owner.value)
    details.sources = markNodesID(owner.sources)
    if (isSolidMemo(owner)) {
      details.observers = markNodesID(owner.observers)
    }
  }

  FocusedOwner = owner
  FocusedOwnerDetails = details
}

function mapChildren({ owned, ownedRoots }: Readonly<SolidOwner>): MappedOwner[] {
  const children: MappedOwner[] = []

  if (owned)
    children.push.apply(
      children,
      owned.map(child => mapOwner(child)),
    )

  if (ownedRoots)
    children.push.apply(
      children,
      [...ownedRoots].map(child => mapOwner(child, NodeType.Root)),
    )

  return children
}

function mapOwner(owner: SolidOwner, type?: NodeType): MappedOwner {
  type = markOwnerType(owner, type)
  const id = markNodeID(owner)
  const name = markOwnerName(owner)

  if (id === FocusedID) collectOwnerDetails(owner)

  observeComputation(owner, id)

  if (GatherComponents && type === NodeType.Component) {
    const resolved = resolveElements(owner.value)
    if (resolved) Components.push({ name, resolved })
  }

  return {
    id,
    name,
    type,
    children: mapChildren(owner),
    sources: markNodesID(owner.sources),
  }
}

export type WalkerConfig = {
  rootId: number
  onSignalUpdate: SignalUpdateHandler
  onComputationUpdate: ComputationUpdateHandler
  observeComputations: boolean
  gatherComponents: boolean
  focusedID: number | null
}

export function walkSolidTree(
  owner: SolidOwner,
  config: WalkerConfig,
): {
  tree: MappedOwner
  components: MappedComponent[]
  focusedOwnerDetails: OwnerDetails | null
  focusedOwner: SolidOwner | null
} {
  // set the globals to be available for this walk cycle
  FocusedID = config.focusedID
  RootID = config.rootId
  OnSignalUpdate = config.onSignalUpdate
  OnComputationUpdate = config.onComputationUpdate
  ObserveComputations = config.observeComputations
  GatherComponents = config.gatherComponents
  if (GatherComponents) Components = []

  const tree = mapOwner(owner)
  const components = Components
  const focusedOwner = FocusedOwner
  const focusedOwnerDetails = FocusedOwnerDetails

  return { tree, components, focusedOwner, focusedOwnerDetails }
}

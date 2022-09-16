import { batch, createRoot, createSignal } from "solid-js"
import { Mapped, NodeID, NodeType, RootsUpdates } from "@solid-devtools/shared/graph"
import { Writable } from "type-fest"
import { createUpdatedSelector } from "./utils"

export interface StructureNode {
  readonly id: NodeID
  readonly name: string
  readonly type: NodeType
  readonly children: StructureNode[]
  readonly length: number
}

function pushToMapList<K, T>(map: Map<K, T[]>, key: K, value: T): void {
  const list = map.get(key)
  if (list) list.push(value)
  else map.set(key, [value])
}
function removeFromMapList<K, T>(map: Map<K, T[]>, key: K, value: T): void {
  const roots = map.get(key)
  if (!roots) return
  const index = roots.indexOf(value)
  if (index === -1) return
  roots.splice(index, 1)
  if (roots.length === 0) map.delete(key)
}

function getNodeById(
  nodeMap: typeof $nodeMap,
  id: NodeID,
  rootId: NodeID,
): StructureNode | undefined
function getNodeById(nodeMap: typeof $nodeMap, id: NodeID): StructureNode | undefined
function getNodeById(
  nodeMap: typeof $nodeMap,
  id: NodeID,
  rootId?: NodeID,
): StructureNode | undefined {
  if (rootId) {
    const nodes = nodeMap.get(rootId)
    if (nodes) {
      for (const node of nodes) {
        if (node.id === id) return node
      }
    }
  } else {
    for (const nodes of nodeMap.values()) {
      for (const node of nodes) {
        if (node.id === id) return node
      }
    }
  }
}

let $attachments: Map<NodeID, Mapped.Root[]>
let $mappedRoots: Map<NodeID, Mapped.Root>
let $nodeMap: Map<NodeID, StructureNode[]>

function mapOwner(
  raw: Readonly<Mapped.Owner>,
  parent: Writable<StructureNode> | null,
  nodeList: StructureNode[],
): StructureNode {
  const { id, name, type, children: rawChildren } = raw
  const subroots = $attachments.get(id)
  let ci = 0
  const children: StructureNode[] = Array(rawChildren.length + (subroots ? subroots.length : 0))
  const node: Writable<StructureNode> = { id, name, type, children, length: 0 }
  // map children
  for (; ci < rawChildren.length; ci++) {
    const child = mapOwner(rawChildren[ci], node, nodeList)
    children[ci] = child
  }
  // map attached subroots
  if (subroots) {
    for (let i = 0; i < subroots.length; i++) {
      const { tree, id: rootId } = subroots[i]
      const subNodeList: StructureNode[] = []
      $nodeMap.set(rootId, subNodeList)
      const child = mapOwner(tree, node, subNodeList)
      children[ci + i] = child
    }
  }
  if (parent) parent.length += node.length + 1
  nodeList.push(node)
  return node
}

export function mapStructureUpdates(config: {
  prev: readonly StructureNode[]
  removed: readonly NodeID[]
  updated: readonly Mapped.Root[]
  attachments: typeof $attachments
  mappedRoots: typeof $mappedRoots
  nodeMap: typeof $nodeMap
}): StructureNode[] {
  const { prev, removed, updated, attachments, mappedRoots, nodeMap } = config
  $attachments = attachments
  $mappedRoots = mappedRoots
  $nodeMap = nodeMap

  const order: Mapped.Root[] = []
  $nodeMap.clear()

  for (const id of removed) {
    const mapped = $mappedRoots.get(id)!
    const { attachedTo } = mapped
    $mappedRoots.delete(id)
    if (attachedTo) removeFromMapList($attachments, attachedTo, mapped)
  }

  for (let i = 0; i < prev.length; i++) {
    const id = prev[i].id
    let mapped = $mappedRoots.get(id)
    // REMOVED top level roots
    if (!mapped) continue

    // UPDATED top level roots
    for (const updatedRoot of updated)
      if (updatedRoot.id === id) {
        $mappedRoots.set(id, (mapped = updatedRoot))
        break
      }

    order.push(mapped)
  }

  for (const mapped of updated) {
    const { id, attachedTo } = mapped

    if ($mappedRoots.has(id)) {
      if (!order.includes(mapped)) {
        // ATTACHED root
        const oldMapped = $mappedRoots.get(id)!
        const oldAttachedTo = oldMapped.attachedTo
        oldAttachedTo && removeFromMapList($attachments, oldAttachedTo, oldMapped)
      } else continue
    }

    // ADDED roots
    $mappedRoots.set(id, mapped)
    if (attachedTo) pushToMapList($attachments, attachedTo, mapped)
    else order.push(mapped)
  }

  const next: StructureNode[] = Array(order.length)
  for (let i = 0; i < order.length; i++) {
    const { id, tree } = order[i]
    const nodeList: StructureNode[] = []
    $nodeMap.set(id, nodeList)
    next[i] = mapOwner(tree, null, nodeList)
  }
  return next
}

const structure = createRoot(() => {
  const [roots, setRoots] = createSignal<StructureNode[]>([])

  /** parent nodeId : rootId to be attached */
  const attachments: typeof $attachments = new Map()
  /** rootId : mappedRoot */
  const mappedRoots: typeof $mappedRoots = new Map()
  /** rootId : list of nodes down in the tree */
  const nodeMap: typeof $nodeMap = new Map()

  function updateStructure({ removed, updated }: RootsUpdates) {
    batch(() => {
      clearUpdatedComputations()
      const time = performance.now()
      setRoots(prev =>
        mapStructureUpdates({ prev, removed, updated, attachments, mappedRoots, nodeMap }),
      )
      console.log("updateStructure: ", performance.now() - time)
    })
  }

  function clearRoots() {
    mappedRoots.clear()
    attachments.clear()
    nodeMap.clear()
    setRoots([])
  }

  const [useComputationUpdatedSelector, addUpdatedComputations, clearUpdatedComputations] =
    createUpdatedSelector()

  function handleComputationsUpdate(nodeIds: NodeID[]) {
    addUpdatedComputations(nodeIds)
  }

  return {
    roots,
    hovered: () => ({ rootId: null, node: null as null | StructureNode, sync: false }),
    clearRoots,
    updateStructure,
    handleComputationsUpdate,
    toggleHoveredOwner: (...a: any[]) => {},
    getNodeById: getNodeById.bind(null, nodeMap),
  }
})
export default structure

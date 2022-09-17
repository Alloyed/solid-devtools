import { batch, createRoot, createSelector, createSignal } from "solid-js"
import { Writable } from "type-fest"
import { Mapped, NodeID, NodeType, RootsUpdates } from "@solid-devtools/shared/graph"
import { createUpdatedSelector } from "./utils"

export namespace Structure {
  export interface Node {
    readonly id: NodeID
    readonly name: string
    readonly type: NodeType
    readonly children: Node[]
    readonly length: number
  }

  export type Hovered = { readonly rootId: NodeID; readonly node: Node } | null
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

function findNode(
  nodeMap: typeof $nodeMap,
  id: NodeID,
): { node: Structure.Node; rootId: NodeID } | undefined {
  for (const [rootId, nodes] of Object.entries(nodeMap)) {
    const node = nodes[id]
    if (node) return { node, rootId }
  }
}

let $attachments: Map<NodeID, Mapped.Root[]>
let $mappedRoots: Map<NodeID, Mapped.Root>
let $nodeMap: Record<NodeID, Record<NodeID, Structure.Node>>

function mapOwner(
  raw: Readonly<Mapped.Owner>,
  parent: Writable<Structure.Node> | null,
  nodes: Record<NodeID, Structure.Node>,
): Structure.Node {
  const { id, name, type, children: rawChildren } = raw
  const subroots = $attachments.get(id)
  let ci = 0
  const children: Structure.Node[] = Array(rawChildren.length + (subroots ? subroots.length : 0))
  const node: Writable<Structure.Node> = { id, name, type, children, length: 0 }
  // map children
  for (; ci < rawChildren.length; ci++) {
    const child = mapOwner(rawChildren[ci], node, nodes)
    children[ci] = child
  }
  // map attached subroots
  if (subroots) {
    for (let i = 0; i < subroots.length; i++) {
      const { tree, id: rootId } = subroots[i]
      const nodes: Record<NodeID, Structure.Node> = {}
      $nodeMap[rootId] = nodes
      const child = mapOwner(tree, node, nodes)
      children[ci + i] = child
    }
  }
  if (parent) parent.length += node.length + 1
  nodes[id] = node
  return node
}

export function mapStructureUpdates(config: {
  prev: readonly Structure.Node[]
  removed: readonly NodeID[]
  updated: readonly Mapped.Root[]
  attachments: typeof $attachments
  mappedRoots: typeof $mappedRoots
}): { structure: Structure.Node[]; nodeMap: typeof $nodeMap } {
  const { prev, removed, updated, attachments, mappedRoots } = config
  $attachments = attachments
  $mappedRoots = mappedRoots
  $nodeMap = {}

  const order: Mapped.Root[] = []

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

  const next: Structure.Node[] = Array(order.length)
  for (let i = 0; i < order.length; i++) {
    const { id, tree } = order[i]
    const nodes: Record<NodeID, Structure.Node> = {}
    $nodeMap[id] = nodes
    next[i] = mapOwner(tree, null, nodes)
  }
  return { structure: next, nodeMap: $nodeMap }
}

const structure = createRoot(() => {
  const [structure, setStructure] = createSignal<Structure.Node[]>([])

  /** parent nodeId : rootId to be attached */
  const attachments: typeof $attachments = new Map()
  /** rootId : mappedRoot */
  const mappedRoots: typeof $mappedRoots = new Map()
  /** rootId : list of nodes down in the tree */
  let nodeMap: typeof $nodeMap = {}

  function updateStructure({ removed, updated }: RootsUpdates) {
    batch(() => {
      clearUpdatedComputations()
      setStructure(prev => {
        const { structure, nodeMap: nextNodeMap } = mapStructureUpdates({
          prev,
          removed,
          updated,
          attachments,
          mappedRoots,
        })
        nodeMap = nextNodeMap
        return structure
      })
    })
  }

  const [isUpdated, addUpdatedComputations, clearUpdatedComputations] = createUpdatedSelector()

  const [hovered, setHovered] = createSignal<Structure.Hovered>(null)
  const isHovered = createSelector(hovered, (id: NodeID, o) => !!o && o.node.id === id)

  function toggleHoveredOwner(id: NodeID, hovered: boolean): Structure.Hovered {
    return setHovered(p => {
      if (hovered) return findNode(nodeMap, id) ?? p
      return p && p.node.id === id ? null : p
    })
  }

  function resetStructure() {
    mappedRoots.clear()
    attachments.clear()
    nodeMap = {}
    batch(() => {
      setStructure([])
      setHovered(null)
    })
  }

  return {
    structure,
    resetStructure,
    updateStructure,
    hovered,
    isHovered,
    addUpdatedComputations,
    isUpdated,
    toggleHoveredOwner,
    findNode: (nodeId: NodeID): ReturnType<typeof findNode> => findNode(nodeMap, nodeId),
    getNode: (rootId: NodeID, nodeId: NodeID): Structure.Node | undefined =>
      nodeMap[rootId]?.[nodeId],
  }
})
export default structure

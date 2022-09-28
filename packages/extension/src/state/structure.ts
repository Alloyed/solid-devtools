import { batch, createRoot, createSelector, createSignal, untrack } from "solid-js"
import { NodeID, NodeType, RootsUpdates } from "@solid-devtools/shared/graph"
import { createUpdatedSelector } from "./utils"
import { reconcileStructure } from "./structure-reconcile"

export namespace Structure {
  export interface Node {
    id: NodeID
    name?: string
    type: NodeType
    level: number
    parent: Node | null
    children: Node[]
    subroots?: Node[]
    hmr?: boolean
    frozen?: true
  }

  export interface Root extends Node {
    name?: undefined
    frozen?: undefined
    type: NodeType.Root
  }

  export interface Component extends Node {
    name: string
    frozen?: undefined
    type: NodeType.Component
    hmr: boolean
  }

  export interface Computation extends Node {
    type: NodeType.Computation | NodeType.Memo | NodeType.Effect | NodeType.Render
    hmr?: undefined
  }

  export type State = { roots: Node[]; nodeList: Node[] }
}

function getParentRoot(node: Structure.Node): Structure.Node {
  let current: Structure.Node | null = node
  while (current) {
    if (current.type === NodeType.Root) return current
    current = current.parent
  }
  throw new Error("Parent root not found")
}

function getNodePath(node: Structure.Node): Structure.Node[] {
  const path = [node]
  let parent = node.parent
  while (parent) {
    path.unshift(parent)
    parent = parent.parent
  }
  return path
}

const structure = createRoot(() => {
  const [structure, setStructure] = createSignal<Structure.State>({ nodeList: [], roots: [] })

  function updateStructure({ removed, updated }: RootsUpdates): void {
    batch(() => {
      clearUpdatedComputations()
      setStructure(prev => reconcileStructure(prev.roots, updated, removed))
    })
  }

  function findNode(id: NodeID): Structure.Node | undefined {
    for (const node of untrack(structure).nodeList) {
      if (node.id === id) return node
    }
  }

  const [isUpdated, addUpdatedComputations, clearUpdatedComputations] = createUpdatedSelector()

  const [hovered, setHovered] = createSignal<Structure.Node | null>(null)
  const isHovered = createSelector(hovered, (id: NodeID, o) => !!o && o.id === id)

  function toggleHoveredOwner(id: NodeID, hovered: boolean): Structure.Node | null {
    return setHovered(p => {
      if (hovered) return findNode(id) ?? p
      return p && p.id === id ? null : p
    })
  }

  function resetStructure() {
    setStructure({ nodeList: [], roots: [] })
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
    findNode,
    getParentRoot,
    getNodePath,
  }
})
export default structure

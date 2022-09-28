import { resolveElements } from "@solid-primitives/refs"
import { NodeType, NodeID, Solid, Mapped } from "@solid-devtools/shared/graph"
import { markNodeID, markOwnerName, markOwnerType } from "./utils"
import { observeComputationUpdate } from "./update"

export type ComputationUpdateHandler = (rootId: NodeID, nodeId: NodeID) => void

// Globals set before each walker cycle
let $inspectedId: NodeID | null
let $rootId: NodeID
let $onComputationUpdate: ComputationUpdateHandler
let $gatherComponents: boolean
let $components: Mapped.ResolvedComponent[] = []
let $inspectedOwner: Solid.Owner | null

function mapChildren(owner: Solid.Owner): Mapped.Owner[] | undefined {
  const { owned } = owner
  if (!owned || !owned.length) return
  const children: Mapped.Owner[] = Array(owned.length)
  for (let i = 0; i < children.length; i++) children[i] = mapOwner(owned[i])
  return children
}

function mapOwner(owner: Solid.Owner): Mapped.Owner {
  const type = markOwnerType(owner) as Exclude<NodeType, NodeType.Refresh | NodeType.Root>
  const id = markNodeID(owner)
  const name = markOwnerName(owner)

  const mapped = { id, name, type } as Mapped.Owner

  if (id === $inspectedId) $inspectedOwner = owner

  // Component
  if (type === NodeType.Component) {
    if ($gatherComponents) {
      const element = resolveElements(owner.value)
      if (element) $components.push({ id, name, element })
    }
    const { owned } = owner
    // omitting refresh memo — map it's children instead
    let refresh: Solid.Owner | undefined
    let hmr = false
    if (owned && owned.length === 1 && markOwnerType((refresh = owned[0])) === NodeType.Refresh) {
      owner = refresh
      hmr = true
    }
    ;(mapped as Mapped.Component).hmr = hmr
  }
  // Computation
  else {
    observeComputationUpdate(
      owner as Solid.Computation,
      $onComputationUpdate.bind(void 0, $rootId, id),
    )
    if (!owner.sources || owner.sources.length === 0) {
      ;(mapped as Mapped.Computation).frozen = true
    }
  }

  const children = mapChildren(owner)
  if (children) mapped.children = children
  return mapped
}

function mapRoot(
  root: Solid.Root,
  id: NodeID,
  attached: Solid.Owner | null | undefined,
): Mapped.Root {
  if (id === $inspectedId) $inspectedOwner = root

  const mapped: Mapped.Root = { id, type: NodeType.Root }

  const children = mapChildren(root)
  if (children) mapped.children = children

  if (attached) mapped.attached = markNodeID(attached)

  return mapped
}

export type WalkerResult = {
  root: Mapped.Root
  inspectedOwner: Solid.Owner | null
  components: Mapped.ResolvedComponent[]
}

export function walkSolidTree(
  owner: Solid.Root,
  config: {
    rootId: NodeID
    onComputationUpdate: ComputationUpdateHandler
    gatherComponents?: boolean
    inspectedId: NodeID | null
  },
): WalkerResult {
  // set the globals to be available for this walk cycle
  $inspectedId = config.inspectedId
  $rootId = config.rootId
  $onComputationUpdate = config.onComputationUpdate
  $gatherComponents = !!config.gatherComponents
  $inspectedOwner = null
  // components is an array instead of an object to preserve the order (nesting) of the components,
  // this helps the locator find the most nested component first
  $components = []

  const root = mapRoot(owner, $rootId, owner.sdtAttached)

  return { root, inspectedOwner: $inspectedOwner, components: $components }
}

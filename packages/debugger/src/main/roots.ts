import { createRoot, untrack } from 'solid-js'
import { throttle } from '@solid-primitives/scheduled'
import { warn } from '@solid-devtools/shared/utils'
import { ComputationUpdateHandler, WalkerResult, walkSolidTree } from './walker'
import { markNodeID, isSolidRoot, onOwnerCleanup, getOwner } from './utils'
import { Core, NodeID, Solid } from './types'
import { defaultWalkerMode, NodeType, TreeWalkerMode } from './constants'

// TREE WALKER MODE
let $_tree_walker_mode: TreeWalkerMode = defaultWalkerMode

export function changeTreeWalkerMode(newMode: TreeWalkerMode): void {
  $_tree_walker_mode = newMode
  updateAllRoots()
}

const $_root_map = new Map<NodeID, Solid.Root>()

const $_update_queue = new Set<Solid.Owner>()
const $_root_of_owners = new Map<Solid.Owner, NodeID>()
const $_removed_roots = new Set<NodeID>()
let $_update_all_roots = false

export type RootUpdatesHandler = (
  updateResults: WalkerResult[],
  removedIds: ReadonlySet<NodeID>,
) => void

let $_on_root_updates: RootUpdatesHandler | null = null
export function setRootUpdatesHandler(handler: RootUpdatesHandler | null): void {
  $_on_root_updates = handler
  if (handler) updateAllRoots()
}

// will be set in `plugin.ts`
let $_on_computation_update!: (rootId: NodeID, nodeId: NodeID) => void
export function setComputationUpdateHandler(handler: typeof $_on_computation_update): void {
  $_on_computation_update = handler
}
const onComputationUpdate: ComputationUpdateHandler = (rootId, node, changedStructure) => {
  // only if debugger is enabled
  if ($_on_root_updates) {
    changedStructure && updateOwner(node, rootId)
    $_on_computation_update(rootId, markNodeID(node))
  }
}

function forceFlushRootUpdateQueue(): void {
  if ($_on_root_updates) {
    const updated: WalkerResult[] = []
    untrack(() => {
      if ($_update_all_roots) {
        for (const root of $_root_map.values()) {
          const rootId = root.sdtId!
          const update = walkSolidTree(root, {
            mode: $_tree_walker_mode,
            onComputationUpdate,
            rootId,
          })
          updated.push(update)
        }
        $_update_all_roots = false
      } else {
        for (const owner of $_update_queue) {
          const rootId = $_root_of_owners.get(owner)!
          const update = walkSolidTree(owner, {
            mode: $_tree_walker_mode,
            onComputationUpdate,
            rootId,
          })
          updated.push(update)
        }
      }
    })
    $_on_root_updates(updated, $_removed_roots)
  }
  $_update_queue.clear()
  flushRootUpdateQueue.clear()
  $_removed_roots.clear()
  $_root_of_owners.clear()
}
const flushRootUpdateQueue = throttle(forceFlushRootUpdateQueue, 250)

function updateOwner(node: Solid.Owner, topRootId: NodeID): void {
  $_update_queue.add(node)
  $_root_of_owners.set(node, topRootId)
  flushRootUpdateQueue()
}

export function updateAllRoots(): void {
  $_update_all_roots = true
  flushRootUpdateQueue()
}

export function forceUpdateAllRoots(): void {
  $_update_all_roots = true
  forceFlushRootUpdateQueue()
}

export function createStructureRoot(owner: Solid.Root): void {
  const rootId = markNodeID(owner)

  $_root_map.set(rootId, owner)
  updateOwner(owner, rootId)
}

function cleanupRoot(root: Solid.Root): void {
  const rootId = markNodeID(root)
  root.isDisposed = true
  changeRootAttachment(root, null)

  const wasTarcked = $_root_map.delete(rootId)
  if (wasTarcked) {
    $_removed_roots.add(rootId)
    flushRootUpdateQueue()
  }
}

/**
 * For switching what owner sub-roots are attached to.
 * It'll remove the root from its current owner and attach it to the new owner.
 */
function changeRootAttachment(root: Solid.Root, newParent: Solid.Owner | null): void {
  let topRoot: Solid.Root | undefined | null

  if (root.sdtAttached) {
    root.sdtAttached.sdtSubRoots!.splice(root.sdtAttached.sdtSubRoots!.indexOf(root), 1)
    topRoot = getTopRoot(root.sdtAttached)
    if (topRoot) updateOwner(root.sdtAttached, topRoot.sdtId!)
  }

  if (newParent) {
    root.sdtAttached = newParent
    if (newParent.sdtSubRoots) newParent.sdtSubRoots.push(root)
    else newParent.sdtSubRoots = [root]

    if (topRoot === undefined) topRoot = getTopRoot(newParent)
    if (topRoot) updateOwner(newParent, topRoot.sdtId!)
  } else {
    delete root.sdtAttached
  }
}

/**
 * Helps the debugger find and reattach an reactive owner created by `createRoot` to it's detached parent.
 *
 * Call this synchronously inside `createRoot` callback body, whenever you are using `createRoot` yourself to dispose of computations early, or inside `<For>`/`<Index>` components to reattach their children to reactive graph visible by the devtools debugger.
 * @example
 * createRoot(dispose => {
 * 	// This reactive Owner disapears form the owner tree
 *
 * 	// Reattach the Owner to the tree:
 * 	attachDebugger();
 * });
 */
export function attachDebugger(_owner: Core.Owner = getOwner()!): void {
  let owner = _owner as Solid.Owner
  if (!owner) return warn('reatachOwner helper should be called synchronously in a reactive owner.')

  // find all the roots in the owner tree (walking up the tree)
  const roots: Solid.Root[] = []
  let isFirstTopLevel = true
  while (owner) {
    if (isSolidRoot(owner)) {
      // INTERNAL | disposed
      if (owner.isInternal || owner.isDisposed) return
      // already attached
      if ($_root_map.has(markNodeID(owner))) {
        isFirstTopLevel = false
        break
      }
      roots.push(owner)
    }
    owner = owner.owner!
  }

  // attach roots in reverse order (from top to bottom)
  for (let i = roots.length - 1; i >= 0; i--) {
    const root = roots[i]
    root.sdtType = NodeType.Root

    onOwnerCleanup(root, () => cleanupRoot(root), true)

    const isTopLevel = isFirstTopLevel && i === 0

    // root (top-level)
    if (isTopLevel) {
      createStructureRoot(root)
      return
    }
    // sub-root (nested)
    let parent = findClosestAliveParent(root)!
    if (!parent.owner) return warn('Parent owner is missing.')
    changeRootAttachment(root, parent.owner)

    const onParentCleanup = () => {
      const newParent = findClosestAliveParent(root)
      changeRootAttachment(root, newParent.owner)
      // still a sub-root
      if (newParent.owner) {
        parent = newParent
        onOwnerCleanup(parent.root, onParentCleanup)
      }
      // becomes a root
      else {
        removeOwnCleanup()
        createStructureRoot(root)
      }
    }
    const removeParentCleanup = onOwnerCleanup(parent.root, onParentCleanup)
    const removeOwnCleanup = onOwnerCleanup(root, removeParentCleanup)
  }
}

/**
 * Unobserves currently observed root owners.
 * This is not reversable, and should be used only when you are sure that they won't be used anymore.
 */
export function unobserveAllRoots(): void {
  $_root_map.forEach(r => cleanupRoot(r))
}

//
// AFTER CREATE ROOT
//

let $_autoattach_enabled = false
let $_internal_root_count = 0
/**
 * Listens to `createRoot` calls and attaches debugger to them.
 */
export function enableRootsAutoattach(): void {
  if ($_autoattach_enabled) return
  $_autoattach_enabled = true

  const autoattach = (root: Core.Owner) => {
    if ($_internal_root_count) return
    attachDebugger(root)
  }

  if (typeof window._$afterCreateRoot === 'function') {
    const old = window._$afterCreateRoot
    window._$afterCreateRoot = (root: Core.Owner) => {
      old(root)
      autoattach(root)
    }
  } else window._$afterCreateRoot = autoattach
}

/**
 * Sold's `createRoot` primitive that won't be tracked by the debugger.
 */
export const createInternalRoot: typeof createRoot = (fn, detachedOwner) => {
  $_internal_root_count++
  const r = createRoot(dispose => {
    ;(getOwner() as Solid.Root).isInternal = true
    return fn(dispose)
  }, detachedOwner)
  $_internal_root_count--
  return r
}

/**
 * Looks though the children of the given root to find owner of given {@link id}.
 */
export const findOwnerById = (rootId: NodeID, id: NodeID): Solid.Owner | undefined => {
  const root = $_root_map.get(rootId)
  if (!root) return
  const toCheck: Solid.Owner[] = [root]
  while (toCheck.length) {
    const owner = toCheck.pop()!
    if (owner.sdtId === id) return owner
    if (owner.owned) toCheck.push.apply(toCheck, owner.owned)
  }
}

function getTopRoot(owner: Solid.Owner): Solid.Root | null {
  let root: Solid.Root | null = null
  while (owner) {
    if (isSolidRoot(owner)) root = owner
    owner = owner.owner!
  }
  return root
}

/**
 * Searches for the closest alive parent of the given owner.
 * A parent here consists of `{ owner: SolidOwner; root: SolidRoot }` where `owner` is the closest tree node to attach to, and `root` in the closest subroot/root that is not disposed.
 * @param owner
 * @returns `{ owner: SolidOwner; root: SolidRoot }`
 */
function findClosestAliveParent(
  owner: Solid.Owner,
): { owner: Solid.Owner; root: Solid.Root } | { owner: null; root: null } {
  let disposed: Solid.Root | null = null
  let closestAliveRoot: Solid.Root | null = null
  let current = owner
  while (current.owner && !closestAliveRoot) {
    current = current.owner
    if (isSolidRoot(current)) {
      if (current.isDisposed) disposed = current
      else closestAliveRoot = current
    }
  }
  if (!closestAliveRoot) return { owner: null, root: null }
  return { owner: disposed?.owner ?? owner.owner!, root: closestAliveRoot }
}

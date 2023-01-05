import { trimString } from '@solid-devtools/shared/utils'
import { Emit } from '@solid-primitives/event-bus'
import { throttle } from '@solid-primitives/scheduled'
import {
  createComputed,
  createRoot,
  getOwner as _getOwner,
  onCleanup,
  runWithOwner,
} from 'solid-js'
import { DEV as _STORE_DEV } from 'solid-js/store'
import { $SDT_ID, NodeType } from './constants'
import { getNewSdtId } from './id'
import { Core, NodeID, Solid } from './types'

const STORE_DEV = _STORE_DEV!

export const getOwner = _getOwner as () => Solid.Owner | null

export const isSolidComputation = (o: Readonly<Solid.Owner>): o is Solid.Computation => 'fn' in o

export const isSolidMemo = (o: Readonly<Solid.Owner>): o is Solid.Memo =>
  'sdtType' in o ? o.sdtType === NodeType.Memo : isSolidComputation(o) && _isMemo(o)

export const isSolidOwner = (
  o: Readonly<Solid.Owner | Solid.Store | Solid.Signal>,
): o is Solid.Owner => 'owned' in o

export const isSolidRoot = (o: Readonly<Solid.Owner>): o is Solid.Root =>
  o.sdtType === NodeType.Root || !isSolidComputation(o)

export const isSolidComponent = (o: Readonly<Solid.Owner>): o is Solid.Component => 'props' in o

export const isStoreNode = (o: object): o is Core.Store.StoreNode => STORE_DEV.$NAME in o

export const isSolidStore = (o: Readonly<Solid.Signal | Solid.Store>): o is Solid.Store => {
  return !('observers' in o) && STORE_DEV.$NAME in o.value
}

const _isMemo = (o: Readonly<Solid.Computation>): boolean =>
  'value' in o && 'comparator' in o && o.pure === true

export function getOwnerName(owner: Readonly<Solid.Owner>): string {
  const { name, componentName: component } = owner
  if (component && typeof component === 'string')
    return component.startsWith('_Hot$$') ? component.slice(6) : component
  return name || '(unnamed)'
}
export function getSignalName(signal: Readonly<Solid.Signal>): string {
  return signal.name || '(unnamed)'
}

export const getStoreNodeName = (node: Core.Store.StoreNode): string =>
  node[STORE_DEV.$NAME] || '(unnamed)'

export function getNodeName(o: Readonly<Solid.Signal | Solid.Owner | Solid.Store>): string {
  const name = isSolidOwner(o)
    ? getOwnerName(o)
    : isSolidStore(o)
    ? getStoreNodeName(o)
    : getSignalName(o)
  return getDisplayName(name)
}

export function getDisplayName(name: string): string {
  return trimString(name, 20)
}

export function getNodeType(o: Readonly<Solid.Signal | Solid.Owner | Solid.Store>): NodeType {
  if (isSolidOwner(o)) return getOwnerType(o)
  return isSolidStore(o) ? NodeType.Store : NodeType.Signal
}

export const getOwnerType = (o: Readonly<Solid.Owner>): NodeType => {
  if (typeof o.sdtType !== 'undefined') return o.sdtType
  if (!isSolidComputation(o)) return NodeType.Root
  if (isSolidComponent(o)) return NodeType.Component
  if (_isMemo(o)) {
    let parent: Solid.Owner | null, parentName: string | undefined
    if (
      (parent = o.owner) &&
      isSolidComponent(parent) &&
      (parentName = parent.componentName) &&
      parentName.startsWith('_Hot$$')
    )
      return NodeType.Refresh
    return NodeType.Memo
  }
  // Effect
  if (o.pure === false) {
    if (o.user === true) return NodeType.Effect
    if (o.context !== null) return NodeType.Context
    return NodeType.Render
  }
  return NodeType.Computation
}

export function markOwnerName(o: Solid.Owner): string {
  if (o.sdtName !== undefined) return o.sdtName
  return (o.sdtName = getNodeName(o))
}
export function markOwnerType(o: Solid.Owner): NodeType {
  if (o.sdtType !== undefined) return o.sdtType
  return (o.sdtType = getOwnerType(o))
}

export function markNodeID(o: { [$SDT_ID]?: NodeID }): NodeID {
  if (o[$SDT_ID] !== undefined) return o[$SDT_ID]
  return (o[$SDT_ID] = getNewSdtId())
}

export class NodeIDMap<T extends { [$SDT_ID]?: NodeID }> {
  private obj: Record<NodeID, T> = {}

  get(id: NodeID): T | undefined {
    return this.obj[id]
  }

  set(o: T): NodeID {
    const id = markNodeID(o)
    if (!(id in this.obj)) this.obj[id] = o
    return id
  }
}

export function getComponentRefreshNode(owner: Readonly<Solid.Component>): Solid.Memo | null {
  const { owned } = owner
  let refresh: Solid.Owner
  if (owned && owned.length === 1 && markOwnerType((refresh = owned[0]!)) === NodeType.Refresh) {
    return refresh as Solid.Memo
  }
  return null
}

export function resolveElements(value: unknown): HTMLElement[] | null {
  const resolved = getResolvedElements(value)
  if (Array.isArray(resolved)) return resolved.length ? resolved : null
  return resolved ? [resolved] : null
}
function getResolvedElements(value: unknown): HTMLElement | HTMLElement[] | null {
  // do not call a function, unless it's a signal (to prevent creating new nodes)
  if (typeof value === 'function' && !value.length && value.name === 'bound readSignal')
    return getResolvedElements(value())
  if (Array.isArray(value)) {
    const results: HTMLElement[] = []
    for (const item of value) {
      const result = getResolvedElements(item)
      if (result) Array.isArray(result) ? results.push.apply(results, result) : results.push(result)
    }
    return results
  }
  return value instanceof HTMLElement ? value : null
}

/**
 * helper to getting to an owner that you want — walking downwards
 */
export function findOwner(
  root: Solid.Owner,
  predicate: (owner: Solid.Owner) => boolean,
): Solid.Owner | null {
  const queue: Solid.Owner[] = [root]
  for (const owner of queue) {
    if (predicate(owner)) return owner
    if (Array.isArray(owner.owned)) queue.push(...owner.owned)
  }
  return null
}

export function lookupOwner(
  owner: Solid.Owner,
  predicate: (owner: Solid.Owner) => boolean,
): Solid.Owner | null {
  do {
    if (predicate(owner)) return owner
    owner = owner.owner!
  } while (owner.owner)
  return null
}

/**
 * Solid's `onCleanup` that is registered only if there is a root.
 */
export const tryOnCleanup: typeof onCleanup = fn => (getOwner() ? onCleanup(fn) : fn)

/**
 * Attach onCleanup callback to a reactive owner
 * @param prepend add the callback to the front of the stack, instead of pushing, fot it to be called before other cleanup callbacks.
 * @returns a function to remove the cleanup callback
 */
export function onOwnerCleanup(
  owner: Solid.Owner,
  fn: VoidFunction,
  prepend = false,
  symbol?: symbol,
): VoidFunction {
  if (owner.cleanups === null) owner.cleanups = [fn]
  else {
    if (symbol) {
      if (owner.cleanups.some(c => (c as any)[symbol])) {
        return () =>
          owner.cleanups?.splice(
            owner.cleanups.findIndex(c => (c as any)[symbol]),
            1,
          )
      }
      ;(fn as any)[symbol] = true
    }
    if (prepend) owner.cleanups.unshift(fn)
    else owner.cleanups.push(fn)
  }
  return () => owner.cleanups?.splice(owner.cleanups.indexOf(fn), 1)
}

/**
 * Attach onCleanup callback to the parent of a reactive owner if it has one.
 * @param prepend add the callback to the front of the stack, instead of pushing, fot it to be called before other cleanup callbacks.
 * @returns a function to remove the cleanup callback
 */
export function onParentCleanup(
  owner: Solid.Owner,
  fn: VoidFunction,
  prepend = false,
): VoidFunction {
  if (owner.owner) return onOwnerCleanup(owner.owner, fn, prepend)
  return () => {
    /* noop */
  }
}

// TODO: move onDispose to solid-primitives

const DISPOSE_ID = Symbol('Dispose ID')
export function onDispose<T>(
  fn: () => T,
  { prepend = false, id }: { prepend?: boolean; id?: string | symbol } = {},
): () => T {
  const owner = getOwner()
  if (!owner) {
    // eslint-disable-next-line no-console
    console.warn('onDispose called outside of a reactive owner')
    return fn
  }
  // owner is a root
  if (isSolidRoot(owner)) onOwnerCleanup(owner, fn, prepend)
  // owner is a computation
  else if (owner.owner) {
    if (id !== undefined && owner.owner.cleanups?.some(c => (c as any)[DISPOSE_ID] === id))
      return fn
    onOwnerCleanup(owner.owner, fn, prepend)
    ;(fn as any)[DISPOSE_ID] = id
  }
  return fn
}

export function getFunctionSources(fn: () => unknown): Solid.Signal[] {
  let nodes: Solid.Signal[] | undefined
  let init = true
  runWithOwner(null as any, () =>
    createRoot(dispose =>
      createComputed(() => {
        if (!init) return
        init = false
        fn()
        const sources = getOwner()!.sources
        if (sources) nodes = [...sources]
        dispose()
      }),
    ),
  )
  return nodes ?? []
}

export function dedupeArrayById<T extends { id: NodeID }>(input: T[]): T[] {
  const ids = new Set<NodeID>()
  const deduped: T[] = []
  for (let i = input.length - 1; i >= 0; i--) {
    const update = input[i]!
    if (ids.has(update.id)) continue
    ids.add(update.id)
    deduped.push(update)
  }
  return deduped
}

/**
 * Batches series of updates to a single array of updates.
 *
 * The updates are deduped by `id` property
 */
export function createBatchedUpdateEmitter<T extends { id: NodeID }>(
  emit: Emit<T[]>,
): (update: T) => void {
  const updates: T[] = []

  const triggerUpdateEmit = throttle(() => {
    const deduped = dedupeArrayById(updates)
    updates.length = 0
    emit(deduped)
  })

  return update => {
    updates.push(update)
    triggerUpdateEmit()
  }
}

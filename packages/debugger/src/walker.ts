import { AnyFunction, AnyObject } from "@solid-primitives/utils"
import {
	MappedOwner,
	OwnerType,
	SolidOwner,
	MappedSignal,
	ValueUpdateListener,
	SolidSignal,
} from "@shared/graph"
import { ComputationUpdateHandler, SignalUpdateHandler } from "./batchUpdates"
import { getNewSdtId, getSafeValue } from "./utils"

const isComponent = (o: Readonly<AnyObject>): boolean =>
	"componentName" in o && typeof o.value === "function"

const isMemo = (o: Readonly<AnyObject>): boolean =>
	"value" in o && "comparator" in o && o.pure === true

const fnMatchesRefresh = (fn: AnyFunction): boolean =>
	(fn + "").replace(/[\n\t]/g, "").replace(/ +/g, " ") ===
	"() => { const c = source(); if (c) { return untrack(() => c(props)); } return undefined; }"

const getOwnerName = (owner: Readonly<SolidOwner>): string => {
	const { name, componentName: component } = owner
	if (component) return component.startsWith("_Hot$$") ? component.slice(6) : component
	return name || "(anonymous)"
}

const getOwnerType = (o: Readonly<AnyObject>): OwnerType => {
	// Precompiled components do not start with "_Hot$$"
	// we need a way to identify imported (3rd party) vs user components
	if (isComponent(o)) return OwnerType.Component
	if (isMemo(o)) {
		if (fnMatchesRefresh(o.fn)) return OwnerType.Refresh
		return OwnerType.Memo
	}
	// Effect
	if (o.pure === false) {
		if (o.user === true) return OwnerType.Effect
		return OwnerType.Render
	}
	return OwnerType.Computation
}

/**
 * Wraps the fn prop of owner object to trigger handler whenever the computation is executed.
 */
function observeComputation(owner: SolidOwner, rootId: number, onRun: VoidFunction): void {
	// owner already patched
	if (owner.onComputationUpdate) {
		owner.onComputationUpdate[rootId] = onRun
		return
	}
	// patch owner
	owner.onComputationUpdate = { [rootId]: onRun }
	const fn = owner.fn.bind(owner)
	owner.fn = (...a) => {
		for (const listener of Object.values(owner.onComputationUpdate!)) listener()
		return fn(...a)
	}
}

/**
 * Patches the owner/signal value, firing the callback on each update immediately as it happened.
 */
function observeValueUpdate(
	node: { value: unknown; onSignalUpdate?: Record<number, ValueUpdateListener> },
	rootId: number,
	onUpdate: ValueUpdateListener,
): void {
	// node already patched
	if (node.onSignalUpdate) {
		node.onSignalUpdate[rootId] = onUpdate
		return
	}
	// patch node
	node.onSignalUpdate = { [rootId]: onUpdate }
	let value = node.value
	let safeValue = getSafeValue(value)
	Object.defineProperty(node, "value", {
		get: () => value,
		set: newValue => {
			const newSafe = getSafeValue(newValue)
			for (const listener of Object.values(node.onSignalUpdate!)) listener(newSafe, safeValue)
			;(value = newValue), (safeValue = newSafe)
		},
	})
}

function markOwnerType(o: SolidOwner): OwnerType {
	if (o.sdtType !== undefined) return o.sdtType
	else return (o.sdtType = getOwnerType(o))
}
function markNodeID(o: { sdtId?: number }): number {
	if (o.sdtId !== undefined) return o.sdtId
	else return (o.sdtId = getNewSdtId())
}
function markNodesID(nodes?: { sdtId?: number }[] | null): number[] {
	if (!nodes || !nodes.length) return []
	return nodes.map(markNodeID)
}

function createSignalNode(
	raw: Pick<SolidSignal, "name" | "value" | "observers"> & { id: number },
): MappedSignal {
	return {
		name: raw.name,
		id: raw.id,
		observers: markNodesID(raw.observers),
		value: getSafeValue(raw.value),
	}
}

/**
 * Creates a copy of `sourceMap` without duplicated signals. (after computation rerun, signals are duplicated in sourceMap)
 */
function dedupeSourceMap(
	sourceMap: Readonly<Record<string, SolidSignal>>,
): Record<string, SolidSignal> {
	const map: Record<string, SolidSignal> = {}
	for (let name in sourceMap) {
		const signal = sourceMap[name]
		const match = name.match(/(.*)-\d+(?!.)/)
		if (match) name = signal.name = match[1]
		map[name] = signal
	}
	return map
}

type UpdateHandlers = {
	rootId: number
	onSignalUpdate: SignalUpdateHandler
	onComputationUpdate: ComputationUpdateHandler
}

function mapOwnerSignals(
	owner: SolidOwner,
	{ onSignalUpdate, rootId }: UpdateHandlers,
): MappedSignal[] {
	if (!owner.sourceMap) return []
	const map = (owner.sourceMap = dedupeSourceMap(owner.sourceMap))
	return Object.values(map).map(raw => {
		const id = markNodeID(raw)
		observeValueUpdate(raw, rootId, (value, oldValue) => onSignalUpdate({ id, value, oldValue }))
		return createSignalNode({ ...raw, id })
	})
}

function mapOwner(owner: SolidOwner, handlers: UpdateHandlers): MappedOwner {
	const { onSignalUpdate, onComputationUpdate, rootId } = handlers

	const id = markNodeID(owner)
	const type = markOwnerType(owner)
	const name = getOwnerName(owner)

	observeComputation(owner, rootId, onComputationUpdate.bind(void 0, id))

	const memoProps = (() => {
		if (type !== OwnerType.Memo) return
		observeValueUpdate(owner, rootId, (value, oldValue) => onSignalUpdate({ id, value, oldValue }))
		return {
			signal: createSignalNode({ id, name, value: owner.value, observers: owner.observers }),
		}
	})()

	return {
		id,
		name,
		type,
		signals: mapOwnerSignals(owner, handlers),
		children: mapChildren(owner, handlers),
		sources: markNodesID(owner.sources),
		...memoProps,
	}
}

function mapChildren(owner: Readonly<SolidOwner>, handlers: UpdateHandlers): MappedOwner[] {
	if (!Array.isArray(owner.owned)) return []
	return owner.owned.map(child => mapOwner(child, handlers))
}

function mapOwnerTree(root: SolidOwner, handlers: UpdateHandlers): MappedOwner[] {
	return mapChildren(root, handlers)
}

export { mapOwnerTree }

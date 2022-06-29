import type { SignalState, Owner } from "solid-js/types/reactive/signal"
import { Accessor, onCleanup } from "solid-js"
import { asArray, Many } from "@solid-primitives/utils"
import {
	getOwnerType,
	getOwnerName,
	isSolidComputation,
	observeValueUpdate,
	onParentCleanup,
	getFunctionSources,
	makeSolidUpdateListener,
	getName,
	isSolidMemo,
	isSolidOwner,
	interceptComputationRerun,
} from "@solid-devtools/debugger"
import { getOwner, NodeType, SolidComputation, SolidOwner, SolidSignal } from "@shared/graph"
import { dedupeArray, arrayRefEquals } from "@shared/utils"
import {
	getComputationCreatedLabel,
	getComputationRerunLabel,
	getOwnerDisposedLabel,
	getNodeState,
	logComputation,
	logInitialValue,
	logObservers,
	logOwned,
	logSignalsInitialValues,
	logSignalValueUpdate,
	UNUSED,
	UpdateCause,
} from "./log"

declare module "solid-js/types/reactive/signal" {
	interface Owner {
		$debug?: boolean
		$debugSignals?: boolean
		$debugOwned?: boolean
	}
	interface SignalState<T> {
		$debugSignal?: boolean
	}
}

function makeTimeMeter(): () => number {
	let last = performance.now()
	return () => {
		const now = performance.now()
		const diff = now - last
		last = now
		return Math.round(diff)
	}
}

/**
 * @returns true if the node was marked before
 */
function markDebugNode(o: Owner, type: "computation" | "signals" | "owned"): true | VoidFunction
function markDebugNode(o: SignalState<any>): true | VoidFunction
function markDebugNode(
	o: Owner | SignalState<any>,
	type?: "computation" | "signals" | "owned",
): true | VoidFunction {
	let property: "$debug" | "$debugSignals" | "$debugOwned" | "$debugSignal"
	if (type === "computation") property = "$debug"
	else if (type === "signals") property = "$debugSignals"
	else if (type === "owned") property = "$debugOwned"
	else property = "$debugSignal"

	if ((o as any)[property]) return true
	;(o as any)[property] = true
	return () => ((o as any)[property] = false)
}

interface DebugComputationOptions {
	logInitialState?: boolean
}

/**
 * Debug the current computation owner by logging it's lifecycle state to the browser console.
 * @param owner The owner to debug. If not provided, the current owner will be used.
 * @param options Options for the debug. _(optional)_
 *
 * Following information will be tracked and displayed in the console:
 * - The computation's initial state. (value, name, dependencies, execution time, etc.)
 * - The computation's state after each rerun. (value, previous value, dependencies, sources that have caused the rerun, execution time, etc.)
 * - The computation disposal.
 *
 * @example
 * ```ts
 * createEffect(() => {
 * 	debugComputation()
 * 	// ...
 * })
 * ```
 */
export function debugComputation(owner?: Owner, options?: DebugComputationOptions): void
export function debugComputation(
	_owner?: Owner,
	{ logInitialState = true }: DebugComputationOptions = {},
): void {
	const owner = _owner === undefined ? getOwner() : (_owner as SolidOwner)
	if (!owner || !isSolidComputation(owner)) return console.warn("owner is not a computation")

	if (markDebugNode(owner, "computation") === true) return

	const type = getOwnerType(owner)
	const typeName = NodeType[type]
	const name = getOwnerName(owner)
	const SYMBOL = Symbol(name)
	// log prev value only of the computation callback uses it
	const usesPrev = !!owner.fn.length
	const usesValue = usesPrev || type === NodeType.Memo

	let updateListeners: VoidFunction[] = []
	let signalUpdates: UpdateCause[] = []

	// patches source objects to track their value updates
	// will unsubscribe from previous sources on each call
	const observeSources = (sources: (SolidComputation | SolidSignal)[]) => {
		updateListeners.forEach(unsub => unsub())
		updateListeners = []
		sources.forEach(source => {
			const unsub = observeValueUpdate(
				source,
				value => {
					const update: UpdateCause = {
						type: isSolidOwner(source) ? "computation" : "signal",
						name: getName(source),
						value,
					}
					signalUpdates.push(update)
				},
				SYMBOL,
			)
			updateListeners.push(unsub)
		})
	}

	// this is for logging the initial state after the first callback execution
	// the "value" property is monkey patched for one function execution
	if (logInitialState) {
		const removeValueObserver = observeValueUpdate(
			owner,
			value => {
				const timeElapsed = time()
				removeValueObserver()
				const sources = owner.sources ? dedupeArray(owner.sources) : []

				logComputation(getComputationCreatedLabel(typeName, name, timeElapsed), {
					owner: { type, typeName, name },
					owned: owner.owned ?? [],
					sources,
					prev: UNUSED,
					value: usesValue ? value : UNUSED,
					causedBy: null,
				})
				observeSources(sources)
			},
			SYMBOL,
		)
	}

	// monkey patch the "fn" callback to intercept every computation function execution
	interceptComputationRerun(owner, (fn, prev) => {
		const updates = signalUpdates
		signalUpdates = []

		time()
		const value = fn()
		const elapsedTime = time()

		const sources = owner.sources ? dedupeArray(owner.sources) : []
		logComputation(getComputationRerunLabel(name, elapsedTime), {
			owner: UNUSED,
			owned: owner.owned ?? [],
			sources,
			prev: usesPrev ? prev : UNUSED,
			value: usesValue ? value : UNUSED,
			causedBy: updates,
		})
		observeSources(sources)
	})

	// CLEANUP
	// listen to parent cleanup, instead of own, because for computations onCleanup runs for every re-execution
	onParentCleanup(
		owner,
		() => {
			console.log(...getOwnerDisposedLabel(name))
			updateListeners.forEach(unsub => unsub())
			updateListeners.length = 0
			signalUpdates.length = 0
		},
		// run before other cleanup functions
		true,
	)

	const time = makeTimeMeter()
}

/**
 * Debug the computations owned by the provided {@link owner} by logging their lifecycle state to the browser console.
 * @param owner The owner to debug. If not provided, the current owner will be used.
 * @param options Options for the debug. _(optional)_
 *
 * Following information will be tracked and displayed in the console:
 * - The computations initial state. (value, name, dependencies, execution time, etc.)
 * - The computations state after each rerun. (value, previous value, dependencies, sources that have caused the rerun, execution time, etc.)
 * - The computations disposal.
 *
 * @example
 * ```tsx
 * const Button = props => {
 * 	debugOwnerComputations()
 * 	createEffect(() => {...})
 * 	return <button {...props} />
 * }
 * ```
 */
export function debugOwnerComputations(owner?: Owner): void
export function debugOwnerComputations(_owner?: Owner): void {
	const owner = _owner === undefined ? getOwner() : (_owner as SolidOwner)
	if (!owner) return console.warn("no owner passed to debugOwnedComputations")

	const marked = markDebugNode(owner, "owned")
	if (marked === true) return
	onCleanup(marked)

	const { type, typeName, name } =
		// for solid-refresh HMR memos, return the owned component
		getOwnerType(owner) === NodeType.Refresh ? getNodeState(owner.owner!) : getNodeState(owner)

	let prevOwned: SolidComputation[] = []

	makeSolidUpdateListener(() => {
		const { owned } = owner
		if (!owned) return

		let computations: SolidComputation[] = []

		let i = prevOwned.length
		// owned can only be added
		for (; i < owned.length; i++) {
			const computation = owned[i]
			debugComputation(computation, {
				logInitialState: false,
			})
			computations.push(computation)
		}
		if (computations.length === 0) return

		computations = [...prevOwned, ...computations]
		// log owned computation changes
		logOwned({ type, typeName, name }, computations, prevOwned)
		prevOwned = computations
	})
}

export interface DebugSignalOptions {
	trackObservers?: boolean
	logInitialValue?: boolean
}

/**
 * Debug the provided {@link source} by logging its lifecycle state to the browser console.
 * @param source The signal to debug. *(a function that will be executed to get the signal node)*
 * @param options Options for the debug. _(optional)_
 *
 * Following information will be tracked and displayed in the console:
 * - The signal's initial state. (value, name, observers, etc.)
 * - The signal's state after each value update. (value, previous value, observers, caused reruns, etc.)
 *
 * @example
 * ```ts
 * const [count, setCount] = createSignal(0)
 * debugSignal(count)
 * ```
 */
export function debugSignal(
	source: Accessor<unknown> | SignalState<unknown>,
	options: DebugSignalOptions = {},
): void {
	let signal: SolidSignal

	if (typeof source === "function") {
		const sources = getFunctionSources(source)
		if (sources.length === 0) return console.warn("No signal was passed to debugSignal")
		else if (sources.length > 1)
			return console.warn("More then one signal was passed to debugSignal")
		signal = sources[0]
	} else {
		signal = source as SolidSignal
	}

	if (markDebugNode(signal) === true) return

	const { trackObservers = true, logInitialValue: _logInitialValue = true } = options

	const state = getNodeState(signal)
	const SYMBOL = Symbol(state.name)

	// Initial
	_logInitialValue && logInitialValue({ ...state, value: signal.value })

	let actualObservers: SolidComputation[]
	let prevObservers: SolidComputation[] = []
	let actualPrevObservers: SolidComputation[] = []

	if (!signal.observers) {
		signal.observers = []
		signal.observerSlots = []
	}

	// Value Update
	const stopListening = observeValueUpdate(
		signal,
		(value, prev) => {
			logSignalValueUpdate(
				state,
				value,
				prev,
				trackObservers ? prevObservers : dedupeArray(signal.observers!),
			)
		},
		SYMBOL,
	)
	if (getOwner()) onCleanup(stopListening)

	if (trackObservers) {
		// Observers Change
		function logObserversChange() {
			const observers = dedupeArray(actualObservers)
			if (arrayRefEquals(observers, prevObservers)) return
			logObservers(state.name, observers, prevObservers)
			prevObservers = [...observers]
			actualPrevObservers = [...actualObservers]
		}

		// Listen to Solid's _$afterUpdate hook to check if observers changed
		makeSolidUpdateListener(() => {
			actualObservers = signal.observers!
			if (actualObservers.length !== actualPrevObservers.length) return logObserversChange()
			for (let i = actualObservers.length; i >= 0; i--) {
				if (actualObservers[i] !== actualPrevObservers[i]) return logObserversChange()
			}
		})
	}
}

/**
 * Debug the provided {@link source} signals by logging their lifecycle state to the browser console.
 * @param source The signals to debug. *(a function that will be executed to get the graph nodes — or an array thereof)*
 * @param options Options for the debug. _(optional)_
 *
 * Following information will be tracked and displayed in the console:
 * - The signals initial state. (value, name, observers, etc.)
 * - The signals state after each value update. (value, previous value, observers, caused reruns, etc.)
 *
 * @example
 * ```ts
 * const [count, setCount] = createSignal(0)
 * const double = createMemo(() => count * 2)
 * debugSignals([count, double])
 * ```
 */
export function debugSignals(
	source: Many<Accessor<unknown>> | SignalState<unknown>[],
	options: DebugSignalOptions = {},
): void {
	let signals: SolidSignal[] = []
	asArray(source).forEach(s => {
		if (typeof s === "function") signals.push.apply(signals, getFunctionSources(s))
		else signals.push(s as SolidSignal)
	})
	if (signals.length === 0) return console.warn("No signals were passed to debugSignals")

	// filter out already debugged signals
	signals = signals.filter(s => !s.$debugSignal)

	if (signals.length === 1) return debugSignal(signals[0], options)

	const { logInitialValue = true } = options

	if (logInitialValue) logSignalsInitialValues(signals)

	signals.forEach(signal => {
		debugSignal(signal, {
			...options,
			logInitialValue: false,
		})
	})
}

/**
 * Debug the {@link owner} signals by logging their lifecycle state to the browser console.
 * @param owner owner to get the signals from.
 * @param options Options for the debug. _(optional)_
 *
 * Following information will be tracked and displayed in the console:
 * - The signals initial state. (value, name, observers, etc.)
 * - The signals state after each value update. (value, previous value, observers, caused reruns, etc.)
 *
 * @example
 * ```tsx
 * const Button = props => {
 * 	const [count, setCount] = createSignal(0)
 * 	const double = createMemo(() => count * 2)
 * 	debugOwnerSignals()
 * 	return <button onClick={() => setCount(count + 1)}>{count}</button>
 * }
 * ```
 */
export function debugOwnerSignals(owner?: Owner, options: DebugSignalOptions = {}) {
	owner = getOwner()!
	if (!owner) return console.warn("debugOwnerState found no Owner")

	if (markDebugNode(owner, "signals") === true) return

	const solidOwner = owner as SolidOwner

	let prevSourceListLength = 0
	let prevOwnedLength = 0

	makeSolidUpdateListener(() => {
		const signals: SolidSignal[] = []

		let i: number
		// add owned signals
		if (solidOwner.sourceMap) {
			const sourceList = Object.values(solidOwner.sourceMap)
			// signals can only be added
			for (i = prevSourceListLength; i < sourceList.length; i++) signals.push(sourceList[i])
			prevSourceListLength = i
		}
		// add owned memos
		if (solidOwner.owned) {
			// owned can only be added
			for (i = prevOwnedLength; i < solidOwner.owned.length; i++) {
				const owner = solidOwner.owned[i]
				if (isSolidMemo(owner)) signals.push(owner)
			}
			prevOwnedLength = i
		}

		if (signals.length === 0) return

		debugSignals(signals, options)
	})
}

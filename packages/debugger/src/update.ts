import { onCleanup } from "solid-js"
import { SolidComputation, SolidSignal, ValueUpdateListener } from "@shared/graph"
import { getSafeValue } from "./utils"

let windowAfterUpdatePatched = false
const graphUpdateListeners = new Set<VoidFunction>()

function patchWindowAfterUpdate() {
	if (windowAfterUpdatePatched) return
	const runListeners = () => graphUpdateListeners.forEach(f => f())
	if (typeof window._$afterUpdate === "function") {
		const prev = window._$afterUpdate
		window._$afterUpdate = () => (prev(), runListeners())
	} else window._$afterUpdate = runListeners
}

/**
 * Runs the callback on every Solid Graph Update – whenever computations update because of a signal change.
 * The listener is automatically cleaned-up on root dispose.
 *
 * This will listen to all updates of the reactive graph — including ones outside of the <Debugger> component, and debugger internal computations.
 */
export function makeSolidUpdateListener(onUpdate: VoidFunction): VoidFunction {
	patchWindowAfterUpdate()
	graphUpdateListeners.add(onUpdate)
	return onCleanup(() => graphUpdateListeners.delete(onUpdate))
}

/**
 * Wraps the fn prop of owner object to trigger handler whenever the computation is executed.
 */
export function observeComputationUpdate(owner: SolidComputation, onRun: VoidFunction): void {
	// owner already patched
	if (owner.onComputationUpdate) return void (owner.onComputationUpdate = onRun)
	// patch owner
	owner.onComputationUpdate = onRun
	const fn = owner.fn.bind(owner)
	owner.fn = (...a) => {
		owner.onComputationUpdate!()
		return fn(...a)
	}
}

/**
 * Patches the owner/signal value, firing the callback on each update immediately as it happened.
 */
export function observeValueUpdate(node: SolidSignal, onUpdate: ValueUpdateListener): void {
	// node already patched
	if (node.onValueUpdate) return void (node.onValueUpdate = onUpdate)
	// patch node
	node.onValueUpdate = onUpdate
	let value = node.value
	let safeValue = getSafeValue(value)
	Object.defineProperty(node, "value", {
		get: () => value,
		set: newValue => {
			const newSafe = getSafeValue(newValue)
			node.onValueUpdate!(newSafe, safeValue)
			;(value = newValue), (safeValue = newSafe)
		},
	})
}

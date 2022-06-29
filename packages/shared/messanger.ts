import { isServer } from "@solid-primitives/utils"
import { SerialisedTreeRoot } from "./graph"

export const LOG_MESSAGES = false

export type SafeValue = number | null | undefined | string | boolean

export enum MESSAGE {
	SolidOnPage,
	DevtoolsScriptConnected,
	PanelVisibility,
	ResetPanel,
	GraphUpdate,
	BatchedUpdate,
	ForceUpdate,
}

export interface Message<K extends MESSAGE> {
	id: K
}

export interface MessagePayloads {
	[MESSAGE.SolidOnPage]: void
	[MESSAGE.DevtoolsScriptConnected]: void
	[MESSAGE.PanelVisibility]: boolean
	[MESSAGE.ResetPanel]: void
	[MESSAGE.GraphUpdate]: {
		added: SerialisedTreeRoot[]
		removed: number[]
		updated: SerialisedTreeRoot[]
	}
	[MESSAGE.BatchedUpdate]: BatchedUpdate[]
	[MESSAGE.ForceUpdate]: void
}

export enum UpdateType {
	Signal,
	Computation,
}

export interface SignalUpdatePayload {
	id: number
	value: SafeValue
	oldValue: SafeValue
}

export type BatchedUpdate =
	| {
			type: UpdateType.Signal
			payload: SignalUpdatePayload
	  }
	| {
			type: UpdateType.Computation
			payload: number
	  }

export type PostMessageFn = <K extends MESSAGE>(
	..._: [K] extends [void] ? [id: K] : [id: K, payload: MessagePayloads[K]]
) => void

export type OnMessageFn = <K extends MESSAGE>(
	id: K,
	handler: (payload: MessagePayloads[K]) => void,
) => VoidFunction

export const postWindowMessage: PostMessageFn = (id, payload?: any) => {
	LOG_MESSAGES && console.log("message posted:", MESSAGE[id], payload)
	window.postMessage({ id, payload }, "*")
}

const listeners: Partial<Record<MESSAGE, ((payload: any) => void)[]>> = {}

/**
 * Important ot call this if you want to use {@link onWindowMessage}
 */
export function startListeningWindowMessages() {
	if (isServer) return
	window.addEventListener("message", event => {
		const id = event.data?.id as MESSAGE
		if (typeof id !== "number") return
		listeners[id]?.forEach(f => f(event.data.payload))
	})
}

export const onWindowMessage: OnMessageFn = (id, handler) => {
	let arr = listeners[id]
	if (!arr) arr = listeners[id] = []
	arr.push(handler)
	return () => (listeners[id] = arr!.filter(l => l !== handler))
}

export function once<K extends MESSAGE>(
	method: OnMessageFn,
	id: K,
	handler: (payload: MessagePayloads[K]) => void,
): VoidFunction {
	const unsub = method(id, (...cbArgs) => {
		unsub()
		return handler(...cbArgs)
	})
	return unsub
}

import { FlowComponent, createEffect, getOwner, createRoot } from "solid-js"
import { createBranch } from "@solid-primitives/rootless"
import { postWindowMessage, MESSAGE } from "@shared/messanger"
import { createGraphRoot } from "./update"
import { Owner } from "@shared/graph"

postWindowMessage(MESSAGE.SolidOnPage)

/** helper to getting to an owner that you want */
function findOwner(root: Owner, predicate: (owner: Owner) => boolean): Owner | null {
	const queue: Owner[] = [root]
	for (const owner of queue) {
		if (predicate(owner)) return owner
		if (Array.isArray(owner.owned)) queue.push(...owner.owned)
	}
	return null
}

export const Debugger: FlowComponent = props => {
	const root = getOwner()!

	createBranch(() => {
		const tree = createGraphRoot(root)
		createEffect(() => {
			postWindowMessage(MESSAGE.SolidUpdate, tree)
		})
	})

	return props.children
}

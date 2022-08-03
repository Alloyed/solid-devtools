import { ParentComponent } from "solid-js"
import { attachDebugger } from "./primitives"

// export all graph types from the internal "shared" library
export * from "@shared/graph"

export { registerDebuggerPlugin } from "./plugin"
export type { PluginFactory } from "./plugin"

export type { TargetIDE, TargetURLFunction } from "@solid-devtools/locator"

export { attachDebugger } from "./primitives"

export {
  makeSolidUpdateListener,
  makeCreateRootListener,
  makeStoreObserver,
  observeComputationUpdate,
  observeValueUpdate,
  interceptComputationRerun,
} from "./update"
export type { AfterCrateRoot, ObjectObserver } from "./update"

export {
  getOwnerType,
  getNodeType,
  getNodeName,
  lookupOwner,
  isSolidComputation,
  isSolidMemo,
  isSolidOwner,
  isSolidRoot,
  onOwnerCleanup,
  onParentCleanup,
  getFunctionSources,
  getSafeValue,
  createUnownedRoot,
  createInternalRoot,
} from "./utils"

export const Debugger: ParentComponent = props => {
  attachDebugger()
  return props.children
}

import { attachDebugger, makeCreateRootListener } from "@solid-devtools/debugger"
import { useExtensionAdapter } from "@solid-devtools/extension-adapter"

makeCreateRootListener(root => attachDebugger(root))

// Extension adapter
useExtensionAdapter()

export {
  Debugger,
  attachDebugger,
  registerDebuggerPlugin,
  makeSolidUpdateListener,
} from "@solid-devtools/debugger"
export type { PluginFactory } from "@solid-devtools/debugger"

export * from "@solid-devtools/locator"

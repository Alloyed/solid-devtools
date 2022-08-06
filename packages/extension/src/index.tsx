import { render } from "solid-js/web"
import { Component, createSignal, For } from "solid-js"
import { HighlightsProvider, OwnerNode, Splitter, Scrollable } from "@solid-devtools/ui"
import { graphs, highlights } from "./state/graph"
import * as styles from "./styles.css"
import "@solid-devtools/ui/css"

const App: Component = () => {
  const [sideOpen, setSideOpen] = createSignal(true)

  return (
    <HighlightsProvider value={highlights}>
      <div class={styles.app}>
        <header class={styles.header}>
          <h3>Welcome to Solid Devtools</h3>
          <p>Number of Roots: {Object.keys(graphs).length}</p>
        </header>
        <div class={styles.content}>
          <Splitter
            onToggle={setSideOpen}
            side={sideOpen() ? <p>There is absolutely nothing here :)</p> : undefined}
          >
            <Scrollable>
              <For each={graphs}>{root => <OwnerNode owner={root.tree} />}</For>
            </Scrollable>
          </Splitter>
        </div>
      </div>
    </HighlightsProvider>
  )
}

render(() => <App />, document.getElementById("root")!)

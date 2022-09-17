import { Component, Show } from "solid-js"
import { Entries } from "@solid-primitives/keyed"
import { NodeType } from "@solid-devtools/shared/graph"
import { SignalContextProvider, Scrollable, Signals, ValueNode } from "@/ui"
import inspector, { Inspector } from "../state/inspector"
import * as styles from "./inspector.css"

const DetailsContent: Component<{ details: Inspector.Details }> = ({ details }) => {
  const { name, id, type, signals, props: componentProps } = details
  return (
    <div class={styles.root}>
      <header class={styles.header}>
        <h1 class={styles.h1}>
          {name} <span class={styles.id}>#{id}</span>
        </h1>
        <div class={styles.type}>{NodeType[type]}</div>
      </header>
      <div class={styles.content}>
        {componentProps && (
          <div>
            <h2 class={styles.h2}>
              Props {componentProps.proxy && <span class={styles.proxy}>proxy</span>}
            </h2>
            <Entries of={componentProps.record}>
              {(name, value) => (
                <ValueNode
                  name={name}
                  value={value().value}
                  selected={value().selected}
                  onClick={() => inspector.togglePropFocus(name)}
                  onElementHover={inspector.toggleHoveredElement}
                />
              )}
            </Entries>
          </div>
        )}
        <div>
          <h2 class={styles.h2}>Signals</h2>
          <SignalContextProvider
            value={{
              isUpdated: inspector.isUpdated,
              toggleSignalFocus: inspector.toggleSignalFocus,
              toggleHoveredElement: inspector.toggleHoveredElement,
            }}
          >
            <Signals each={Object.values(signals)} />
          </SignalContextProvider>
        </div>
      </div>
    </div>
  )
}

export default function Details() {
  return (
    <div class={styles.scrollWrapper}>
      <Scrollable>
        <Show when={inspector.state.details} keyed>
          {details => <DetailsContent details={details} />}
        </Show>
      </Scrollable>
    </div>
  )
}

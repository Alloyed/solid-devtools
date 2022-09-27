import { Component, onCleanup } from "solid-js"
import { assignInlineVars } from "@vanilla-extract/dynamic"
import { NodeType } from "@solid-devtools/shared/graph"
import { structure, Structure, inspector } from "@/state"
import { Badge, Highlight, Icon } from "@/ui"
import { useStructure } from "./ctx"
import * as styles from "./ownerNode.css"

export const OwnerNode: Component<{
  owner: Structure.Node
  level: number
}> = props => {
  const { owner } = props
  const { name, type, id, hmr } = owner

  const ctx = useStructure()
  const { toggleCollapsed } = ctx
  const isCollapsed = ctx.isCollapsed.bind(null, owner)

  const { toggleHoveredOwner } = structure

  const isSelected = inspector.isNodeInspected.bind(null, id)
  const isHovered = structure.isHovered.bind(null, id)
  const isUpdated = structure.isUpdated.bind(null, id)

  onCleanup(() => {
    toggleHoveredOwner(id, false)
  })

  const IconComponent: Icon.IconComponent | null = (() => {
    switch (type) {
      case NodeType.Memo:
        return Icon.Memo
      case NodeType.Effect:
        return Icon.Effect
      case NodeType.Root:
        return Icon.Root
      case NodeType.Render:
        return Icon.RenderEffect
      case NodeType.Computation:
        return Icon.Computation
      default:
        return null
    }
  })()

  return (
    <div
      data-hovered={isHovered()}
      data-selected={isSelected()}
      class={styles.contailer}
      onClick={e => inspector.setInspectedNode(isSelected() ? null : owner)}
      onMouseEnter={() => toggleHoveredOwner(id, true)}
      // onMouseLeave is fired in the next tick for the onMouseEnter of other node fired earlier
      onMouseLeave={() => setTimeout(() => toggleHoveredOwner(id, false))}
      style={assignInlineVars({ [styles.levelVar]: props.level + "" })}
    >
      <div class={styles.selection}></div>
      <div class={styles.levelPadding} />
      <div class={styles.nameContainer}>
        <button
          class={styles.collapse}
          aria-selected={isCollapsed()}
          onClick={e => {
            e.stopPropagation()
            toggleCollapsed(owner)
          }}
        >
          <Icon.Triangle class={styles.collapseIcon} />
        </button>
        {/* TODO: observers and sources highlighting */}
        <Highlight strong={isUpdated()} light={false} class={styles.highlight}>
          <>
            {IconComponent && <IconComponent class={styles.typeIcon} />}
            {type === NodeType.Render || type === NodeType.Root ? (
              <div class={styles.type}>{type === NodeType.Render ? "Render Effect" : "Root"}</div>
            ) : (
              <div class={styles.name}>{type === NodeType.Component ? `<${name}>` : name}</div>
            )}
          </>
        </Highlight>
        {hmr && <Badge>HMR</Badge>}
      </div>
    </div>
  )
}

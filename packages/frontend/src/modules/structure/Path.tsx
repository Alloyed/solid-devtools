import { useController } from '@/controller'
import { Icon } from '@/ui'
import { NodeTypeIcon } from '@/ui/components/Owner'
import { NodeType } from '@solid-devtools/debugger/types'
import { createHover } from '@solid-devtools/shared/primitives'
import { createElementSize } from '@solid-primitives/resize-observer'
import { useRemSize } from '@solid-primitives/styles'
import { Component, createMemo } from 'solid-js'
import * as styles from './path.css'

export const OwnerPath: Component = () => {
  const { structure, setInspectedNode, inspector } = useController()

  const rem = useRemSize()
  const containerSize = createElementSize(() => container)
  const expandable = () => (containerSize.height ?? 0) > rem() * styles.MIN_PATH_HEIGHT_IN_REM

  const path = createMemo(() => {
    return [] as any[]
    // TODO
    // const node = inspector.inspectedNode()
    // return node ? structure.getNodePath(node) : []
  })

  let container!: HTMLDivElement
  return (
    <div class={styles.path}>
      <div class={styles.content} data-extendable={expandable()}>
        {expandable() && (
          <div class={styles.expendable}>
            <Icon.Options class={styles.expendableIcon} />
          </div>
        )}
        <div class={styles.container} ref={container}>
          {path().map(node => {
            const hoverProps = createHover(hovering =>
              structure.toggleHoveredNode(node.id, hovering),
            )
            return (
              <>
                <div class={styles.divider}>
                  <Icon.CarretRight class={styles.carret} />
                </div>
                <div
                  class={styles.item}
                  data-hovered={structure.isHovered(node.id)}
                  {...hoverProps}
                  onClick={() => setInspectedNode(node.id)}
                >
                  <div class={styles.highlight} />
                  {node.type === NodeType.Component || node.type === NodeType.Element ? (
                    <div class={styles.name[node.type === NodeType.Component ? 'default' : 'gray']}>
                      {node.name}
                    </div>
                  ) : (
                    <NodeTypeIcon type={node.type} class={styles.typeIcon} />
                  )}
                </div>
              </>
            )
          })}
        </div>
      </div>
    </div>
  )
}

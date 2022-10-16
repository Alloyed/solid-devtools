import { onMount, Component, createSignal, onCleanup, Show } from 'solid-js'
import { Dynamic, Portal } from 'solid-js/web'
import { makeEventListener } from '@solid-primitives/event-listener'
import { clamp } from '@solid-primitives/utils'
import { createBodyCursor } from '@solid-primitives/cursor'
import { Devtools, Icon } from '@solid-devtools/frontend'
import { createInternalRoot } from '@solid-devtools/debugger'
import { createController, enabled, setEnabled } from './controller'

import frontendStyles from '@solid-devtools/frontend/dist/index.css'
import overlayStyles from './styles.css'

interface Props {
  defaultOpen?: boolean
}

export const DevtoolsOverlay: Component<Props> = props => {
  let dispose: VoidFunction | undefined
  onMount(() => props.defaultOpen && setEnabled(true))
  onCleanup(() => {
    setEnabled(false)
    dispose?.()
  })

  setTimeout(() => {
    createInternalRoot(_dispose => {
      dispose = _dispose
      return <Overlay />
    })
  })

  return ''
}

const Overlay: Component = props => {
  const [progress, setProgress] = createSignal(0.5)
  const [dragging, setDragging] = createSignal(false)

  makeEventListener(window, 'pointermove', e => {
    if (!dragging()) return
    const vh = window.innerHeight
    setProgress(1 - clamp(e.y, 0, vh - 300) / vh)
  })
  makeEventListener(window, 'pointerup', setDragging.bind(void 0, false))

  createBodyCursor(() => dragging() && 'row-resize')

  return (
    <Portal useShadow mount={document.documentElement}>
      <div class="overlay__container" data-open={enabled()} style={{ '--progress': progress() }}>
        <div class="overlay__container__fixed">
          <button class="overlay__toggle-button" onClick={() => setEnabled(p => !p)}>
            Devtools
            <Dynamic
              component={enabled() ? Icon.EyeSlash : Icon.Eye}
              class="overlay__toggle-button__icon"
            />
          </button>
          <div
            class="overlay__container__resizer"
            onPointerDown={e => {
              e.preventDefault()
              setDragging(true)
            }}
          />
          <div class="overlay__container__inner">
            <Show when={enabled()}>
              {() => {
                const controller = createController()
                return <Devtools controller={controller} />
              }}
            </Show>
          </div>
        </div>
      </div>
      <style>{frontendStyles}</style>
      <style>{overlayStyles}</style>
    </Portal>
  )
}

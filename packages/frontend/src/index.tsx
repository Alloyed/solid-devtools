import { ErrorOverlay } from '@/ui'
import { Component, JSX } from 'solid-js'
import App from './App'
import * as Controller from './controller'

export { createController } from './controller'
export type { Controller } from './controller'
export { Icon, MountIcons } from './ui'
export type { IconComponent } from './ui'

export const Devtools: Component<{
  controller: Controller.Controller
  errorOverlayFooter?: JSX.Element
  headerSubtitle?: JSX.Element
  useShortcuts?: boolean
  catchWindowErrors?: boolean
}> = props => {
  return (
    <ErrorOverlay footer={props.errorOverlayFooter} catchWindowErrors={props.catchWindowErrors}>
      <Controller.Provider
        controller={props.controller}
        options={{ useShortcuts: props.useShortcuts ?? false }}
      >
        <App headerSubtitle={props.headerSubtitle} />
      </Controller.Provider>
    </ErrorOverlay>
  )
}

import {
  onWindowMessage,
  postWindowMessage,
  startListeningWindowMessages,
} from 'solid-devtools/bridge'
import { warn } from '@solid-devtools/shared/utils'
import { createPortMessanger, DEVTOOLS_CONTENT_PORT } from '../shared/messanger'

const toVersionTuple = (version: string) =>
  version.split('.').map(Number) as [number, number, number]

const extVersion = chrome.runtime.getManifest().version
const matchingClientVersion = __CLIENT_VERSION__

const port = chrome.runtime.connect({ name: DEVTOOLS_CONTENT_PORT })

startListeningWindowMessages()
const { postPortMessage, onPortMessage } = createPortMessanger(port)

onWindowMessage('SolidOnPage', clientVersion => {
  // eslint-disable-next-line no-console
  console.log(
    '🚧 %csolid-devtools%c is in early development! 🚧\nPlease report any bugs to https://github.com/thetarnav/solid-devtools/issues',
    'color: #fff; background: rgba(181, 111, 22, 0.7); padding: 1px 4px;',
    'color: #e38b1b',
  )

  // warn if the matching adapter version is not the same minor version range as the actual adapter
  const adapterTuple = toVersionTuple(clientVersion)
  const wantedTuple = toVersionTuple(matchingClientVersion)

  // match only major and minor version
  for (let i = 0; i < 2; i++) {
    if (adapterTuple[i] !== wantedTuple[i]) {
      warn(
        `${i === 0 ? 'MAJOR' : 'MINOR'} VERSION MISMATCH!
Extension version: ${extVersion}
Client version: ${clientVersion}
Expected client version: ${matchingClientVersion}
Please install "solid-devtools@${matchingClientVersion}" in your project`,
      )
      break
    }
  }

  postPortMessage('SolidOnPage', '')
  postPortMessage('Versions', {
    client: clientVersion,
    extension: extVersion,
    expectedClient: matchingClientVersion,
  })
})

onWindowMessage('ResetPanel', () => postPortMessage('ResetPanel'))

onWindowMessage('StructureUpdate', graph => postPortMessage('StructureUpdate', graph))

onWindowMessage('ComputationUpdates', e => postPortMessage('ComputationUpdates', e))

onWindowMessage('SetInspectedDetails', e => postPortMessage('SetInspectedDetails', e))

onWindowMessage('InspectorUpdate', e => postPortMessage('InspectorUpdate', e))

onWindowMessage('ClientHoveredComponent', e => postPortMessage('ClientHoveredComponent', e))

onWindowMessage('ClientInspectedNode', e => postPortMessage('ClientInspectedNode', e))

onPortMessage('PanelVisibility', e => postWindowMessage('PanelVisibility', e))
onPortMessage('PanelClosed', e => postWindowMessage('PanelClosed', e))

onPortMessage('ForceUpdate', () => postWindowMessage('ForceUpdate'))

onPortMessage('ToggleInspectedValue', e => postWindowMessage('ToggleInspectedValue', e))
onPortMessage('SetInspectedNode', e => postWindowMessage('SetInspectedNode', e))

onPortMessage('HighlightElement', e => postWindowMessage('HighlightElement', e))

onWindowMessage('ClientLocatorMode', e => postPortMessage('ClientLocatorMode', e))
onPortMessage('ExtLocatorMode', e => postWindowMessage('ExtLocatorMode', e))

export {}

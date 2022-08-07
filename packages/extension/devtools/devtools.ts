import { createRuntimeMessanger } from "../shared/messanger"
import { once } from "@solid-devtools/shared/bridge"
import { log } from "@solid-devtools/shared/utils"

log("devtools script working")

const { onRuntimeMessage, postRuntimeMessage } = createRuntimeMessanger()

postRuntimeMessage("DevtoolsScriptConnected")

let panel: chrome.devtools.panels.ExtensionPanel | undefined

once(onRuntimeMessage, "SolidOnPage", async () => {
  if (panel) return console.log("Panel already exists")

  console.log("Solid on page – creating panel")
  try {
    panel = await createPanel()
    console.log("panel", panel)
    panel.onShown.addListener(onPanelShown)
    panel.onHidden.addListener(onPanelHidden)
  } catch (error) {
    console.error(error)
  }
})

const createPanel = () =>
  new Promise<chrome.devtools.panels.ExtensionPanel>((resolve, reject) => {
    chrome.devtools.panels.create(
      "Solid",
      "assets/icons/solid-normal-32.png",
      "index.html",
      newPanel => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError)
        else resolve(newPanel)
      },
    )
  })

function onPanelShown() {
  postRuntimeMessage("PanelVisibility", true)
}

function onPanelHidden() {
  postRuntimeMessage("PanelVisibility", false)
}

export {}

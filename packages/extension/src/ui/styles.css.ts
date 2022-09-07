//
// Global Styles
//

import { globalStyle } from "@vanilla-extract/css"

//
// * Transitions
//
globalStyle(".fade-enter, .fade-exit-to", {
  opacity: 0,
})
globalStyle(".fade-enter-active, .fade-exit-active", {
  transition: "opacity .3s ease",
})
// globalStyle(".fade-enter-active", {
//   transitionDelay: ".1s",
// })

//
// * Checkbox
//

// TODO: style checkboxes
// globalStyle('input[type="checkbox"]', {
//   // appearance: "none",
// })

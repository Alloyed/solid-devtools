import { color, hexToRgb, insetX, spacing, theme, transition } from "@/ui/theme"
import { style } from "@vanilla-extract/css"

export const wrapper = style({
  height: "100%",
  width: "100%",
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
})

export const path = style({
  flexShrink: 0,
  height: spacing[4],
  width: "100%",
  position: "relative",
})
export const pathInner = style({
  position: "absolute",
  zIndex: 1,
  bottom: 0,
  ...insetX(0),
  minHeight: spacing[4],
  width: "100%",
  display: "flex",
  alignItems: "center",
  padding: `${spacing[0.5]} ${spacing[2]}`,
  borderTop: `1px solid ${color.gray[200]}`,
  backgroundColor: color.gray[50],
})

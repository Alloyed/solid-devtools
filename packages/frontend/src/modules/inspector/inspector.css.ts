import {
  spacing,
  theme,
  padding,
  rounded,
  centerChild,
  hexToRgb,
  color,
  transition,
} from '@/ui/theme'
import { colorDisabled, panelBorder } from '@/ui/theme/vars.css'
import { createVar, style } from '@vanilla-extract/css'

export const root = style({
  height: '100%',
  display: 'grid',
  gridTemplateRows: `${spacing[8]} 1fr`,
  gridTemplateColumns: '100%',
})

export const header = style({
  ...padding(0, 2, 0, 4),
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  borderBottom: panelBorder,
})

export const actions = (() => {
  const textOpacity = createVar()
  const bgOpacity = createVar()

  return {
    container: style({
      display: 'flex',
      alignItems: 'center',
      columnGap: spacing[1],
    }),
    button: style({
      width: spacing[6],
      height: spacing[6],
      ...rounded(),
      ...centerChild,
      color: hexToRgb(color.gray[50], textOpacity),
      backgroundColor: hexToRgb(color.gray[100], bgOpacity),
      vars: {
        [bgOpacity]: '0',
        [textOpacity]: '0.5',
      },
      ...transition(['background-color', 'color']),
      selectors: {
        '&:hover': {
          vars: {
            [bgOpacity]: '0.1',
            [textOpacity]: '0.75',
          },
        },
      },
    }),
    icon: style({
      width: spacing[4],
      height: spacing[4],
    }),
  }
})()

export const scrollWrapper = style({
  width: '100%',
  overflow: 'hidden',
})

export const content = style({
  minWidth: '100%',
  width: 'fit-content',
  padding: spacing[4],
  paddingBottom: spacing[16],
  display: 'flex',
  flexDirection: 'column',
  rowGap: spacing[4],
})

export const h2 = style({
  color: colorDisabled,
  marginBottom: spacing[1],
  textTransform: 'capitalize',
})

export const location = style({
  marginTop: spacing[1],
  marginLeft: '2ch',
  fontFamily: theme.font.mono,
})

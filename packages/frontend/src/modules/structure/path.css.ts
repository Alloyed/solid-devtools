import { style } from '@vanilla-extract/css'
import { createHighlightStyles } from '@/ui/mixins'
import { centerChild, color, rounded, spacing, theme } from '@/ui/theme'

const rowHeight = spacing[3]

export const container = style({
  display: 'flex',
  flexWrap: 'wrap',
  fontSize: theme.fontSize.sm,
  lineHeight: rowHeight,
  fontFamily: theme.font.mono,
})

export const divider = style({
  width: rowHeight,
  height: rowHeight,
  marginRight: spacing[1],
  ...centerChild,
})

export const carret = style({
  width: spacing[2],
  height: spacing[2],
  '@media': {
    'screen and (prefers-color-scheme: dark)': {
      color: color.gray[50],
    },
  },
})

const highlights = createHighlightStyles()

export const item = style([
  highlights.container,
  {
    height: rowHeight,
    display: 'flex',
    alignItems: 'center',
    columnGap: spacing[1],
    marginRight: spacing[1],
    ':last-child': {
      marginRight: 0,
    },
    cursor: 'pointer',
    vars: {
      [highlights.bgColorVar]: color.gray[300],
      [highlights.bgOpacityVar]: '0',
    },
    selectors: {
      '&[data-hovered="true"]': {
        vars: { [highlights.bgOpacityVar]: '0.3' },
      },
    },
  },
])

export const highlight = style([
  highlights.highlight,
  {
    border: `1px solid ${color.gray[400]}`,
    ...rounded('sm'),
  },
])

export const typeIcon = style({
  width: spacing[2.5],
  height: spacing[2.5],
  color: color.gray[500],
  '@media': {
    'screen and (prefers-color-scheme: dark)': {
      color: color.gray[200],
    },
  },
})

export const name = style({
  color: color.black,
  transform: 'translateY(0.2px)',
  '@media': {
    'screen and (prefers-color-scheme: dark)': {
      color: color.gray[50],
    },
  },
})

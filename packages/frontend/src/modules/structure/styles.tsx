import {theme} from '@/ui'

export const path_height = theme.spacing[4.5]
export const row_height = theme.spacing[4.5]
export const row_padding = theme.spacing[3.5]
export const v_margin = theme.spacing[3]

export const path_height_in_rem = theme.remValue(path_height)
export const row_height_in_rem = theme.remValue(row_height)
export const v_margin_in_rem = theme.remValue(v_margin)

export const path_height_class = 'h-owner-path-height'
export const path_min_height_class = 'min-h-owner-path-height'

export const owner_path_styles = /*css*/ `
    .${path_height_class} {
        height: ${path_height};
    }
    .${path_min_height_class} {
        min-height: ${path_height};
    }
`

export const row_padding_minus_px = `calc(${row_padding} - 0.95px)`
export const lines_color = theme.vars.panel[3]
export const background_gradient = `repeating-linear-gradient(to right, transparent, transparent ${row_padding_minus_px}, ${lines_color} ${row_padding_minus_px}, ${lines_color} ${row_padding})`
export const padding_mask = `linear-gradient(to right, rgba(0,0,0, 0.4), black ${theme.spacing[48]})`

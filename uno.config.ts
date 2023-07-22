import { defineConfig, presetUno } from 'unocss'
import theme from './configs/theme'

export default defineConfig({
    presets: [presetUno({ dark: 'media' })],
    theme: {
        colors: theme.colors,
        spacing: theme.spacing,
        fontFamily: theme.font,
        fontSize: theme.fontSize,
    },
    variants: [
        matcher => {
            const key = 'selected'
            if (!matcher.startsWith(key + ':')) return matcher
            return {
                matcher: matcher.slice(key.length + 1),
                selector: s => s + '[aria-selected=true]',
            }
        },
    ],
    shortcuts: {
        'center-child': 'flex items-center justify-center',
    },
}) as any

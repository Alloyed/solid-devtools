import { defineConfig } from "vite"
import solidPlugin from "vite-plugin-solid"
import path from "path"

export default defineConfig({
	plugins: [solidPlugin()],
	resolve: {
		alias: {
			// used inside packages/debugger
			"@shared": path.resolve(__dirname, "..", "..", "packages", "shared"),
		},
	},
	build: {
		target: "esnext",
		polyfillDynamicImport: false,
	},
})

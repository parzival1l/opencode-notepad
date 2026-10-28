import { defineConfig } from "vite"
import solid from "vite-plugin-solid"

// Builds a plain page that mounts the real SelectionBar, for the browser tests.
export default defineConfig({
  root: "e2e/harness",
  plugins: [solid()],
  build: { outDir: "dist", emptyOutDir: true },
  logLevel: "warn",
})

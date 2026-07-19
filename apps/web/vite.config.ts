import { defineConfig } from "vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import react from "@vitejs/plugin-react"
import mdx from "fumadocs-mdx/vite"

export default defineConfig({
  plugins: [mdx(), tanstackStart(), react()],
  resolve: {
    // Resolves the `collections/*` -> `.source/*` alias from tsconfig paths
    // (the fumadocs-mdx generated collections).
    tsconfigPaths: true,
  },
  server: {
    // Honor the harness-assigned port (autoPort in .claude/launch.json)
    port: Number(process.env.PORT) || 4000,
  },
})

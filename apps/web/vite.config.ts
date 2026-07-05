import { defineConfig } from "vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import react from "@vitejs/plugin-react"

export default defineConfig({
  plugins: [tanstackStart(), react()],
  server: {
    // Honor the harness-assigned port (autoPort in .claude/launch.json)
    port: Number(process.env.PORT) || 4000,
  },
})

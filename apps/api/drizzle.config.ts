import { defineConfig } from "drizzle-kit"

export default defineConfig({
  out: "./drizzle",
  schema: "./src/modules/persistence/schema.ts",
  dialect: "sqlite",
  dbCredentials: {
    url: "./data/bookmarks.sqlite",
  },
})

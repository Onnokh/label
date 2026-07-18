import { loader } from "fumadocs-core/source"
import { docs } from "collections/server"
import { lucideIconsPlugin } from "fumadocs-core/source/plugins/lucide-icons"

import { openapi } from "./openapi"

export const source = loader(
  {
    docs: docs.toFumadocsSource(),
    openapi: await openapi.staticSource({
      baseDir: "api-reference",
    }),
  },
  {
    baseUrl: "/docs",
    plugins: [lucideIconsPlugin(), openapi.loaderPlugin()],
  },
)

export function slugsToMarkdownPath(slugs: string[]) {
  const segments = [...slugs]
  if (segments.length === 0) {
    segments.push("index.md")
  } else {
    segments[segments.length - 1] += ".md"
  }

  return {
    segments,
    url: `/docs/${segments.join("/")}`,
  }
}

export function markdownPathToSlugs(segs: string[]) {
  if (segs.length === 0) return []

  const out = [...segs]
  out[out.length - 1] = out[out.length - 1].replace(/\.md$/, "")
  if (out.length === 1 && out[0] === "index") out.pop()
  return out
}

export async function getLLMText(page: (typeof source)["$inferPage"]) {
  if (page.type === "openapi") return JSON.stringify(page.data.getSchema(), null, 2)

  const processed = await page.data.getText("processed")

  return `# ${page.data.title} (${page.url})

${processed}`
}

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

const SITE_ORIGIN = "https://sleevy.app"

/** Escapes a value for a double-quoted YAML scalar. */
const yamlString = (value: string) => `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`

/**
 * The Markdown twin of a documentation page.
 *
 * It opens with a frontmatter block so an agent gets the title, the summary,
 * and the canonical address as data, instead of inferring them from the prose
 * or having to fetch the HTML page to find them.
 */
export async function getLLMText(page: (typeof source)["$inferPage"]) {
  if (page.type === "openapi") return JSON.stringify(page.data.getSchema(), null, 2)

  const processed = await page.data.getText("processed")
  const frontmatter = [
    "---",
    `title: ${yamlString(page.data.title)}`,
    ...(page.data.description ? [`description: ${yamlString(page.data.description)}`] : []),
    `canonical: ${yamlString(`${SITE_ORIGIN}${page.url}`)}`,
    `source: ${yamlString(`${SITE_ORIGIN}${slugsToMarkdownPath([...page.slugs]).url.replace(/^\/docs/, "/docs")}`)}`,
    "---",
  ].join("\n")

  return `${frontmatter}

# ${page.data.title}

${processed}`
}

/**
 * Judge the AI Enrichment prompt against real pages.
 *
 *   cd apps/api
 *   bun --env-file=.env scripts/preview-summary-eval.ts urls.txt
 *
 * Every line of the file is one URL. The script fetches each page over plain
 * HTTP (no Lightpanda or Cloudflare fallback), reads the Extracted Page Content
 * the same way AI Enrichment does, and prints the Tags and Preview Summary the
 * live prompt produces. Needs OPENAI_API_KEY.
 */
import { extractPageContent, getMetaContent, getTitle, parseHtml } from "../src/lib/html.js"
import { enrichmentSystemPrompt } from "../src/modules/ai/AiEnricher.js"
import { PAGE_CONTENT_LIMIT } from "../src/modules/metadata/MetadataFetcher.js"
import { topics } from "@sleevy/contract"

const MODEL = process.env.AI_MODEL ?? "gpt-5.4-nano"
const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/140.0 Safari/537.36"

const apiKey = process.env.OPENAI_API_KEY
if (!apiKey) {
  console.error("Set OPENAI_API_KEY (apps/api/.env) before running the eval.")
  process.exit(1)
}

const urlFile = process.argv[2]
if (!urlFile) {
  console.error("Usage: bun --env-file=.env scripts/preview-summary-eval.ts <urls.txt>")
  process.exit(1)
}

type EnrichmentOutput = {
  readonly tags: readonly string[] | null
  readonly summary: string | null
}

const enrich = async (prompt: string): Promise<EnrichmentOutput | string> => {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: globalThis.JSON.stringify({
      model: MODEL,
      input: [
        { role: "system", content: enrichmentSystemPrompt },
        { role: "user", content: prompt },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "link_enrichment",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["tags", "summary"],
            properties: {
              tags: {
                type: ["array", "null"],
                items: { type: "string", enum: [...topics] },
              },
              summary: { type: ["string", "null"] },
            },
          },
        },
      },
    }),
  })

  if (!response.ok) {
    return `request failed with ${response.status}`
  }

  const body = (await response.json()) as {
    readonly output_text?: string
    readonly output?: readonly { readonly content?: readonly { readonly type?: string; readonly text?: string }[] }[]
    readonly usage?: { readonly input_tokens?: number; readonly output_tokens?: number }
  }
  const text =
    body.output_text ??
    body.output
      ?.flatMap((item) => item.content ?? [])
      .find((content) => content.type === "output_text" && content.text)?.text

  if (!text) return "response held no structured output"

  console.log(
    `  tokens   : ${body.usage?.input_tokens ?? "?"} in / ${body.usage?.output_tokens ?? "?"} out`,
  )
  return globalThis.JSON.parse(text) as EnrichmentOutput
}

const urls = (await Bun.file(urlFile).text())
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line.length > 0 && !line.startsWith("#"))

for (const url of urls) {
  let html: string
  try {
    const response = await fetch(url, {
      headers: { "user-agent": BROWSER_USER_AGENT, accept: "text/html,application/xhtml+xml" },
      signal: AbortSignal.timeout(20_000),
    })
    html = await response.text()
  } catch (cause) {
    console.log(`\n=== ${url}\n  fetch failed: ${String(cause)}`)
    continue
  }

  const document = parseHtml(html)
  const title = getMetaContent(document, ["og:title", "twitter:title"]) ?? getTitle(document)
  const description = getMetaContent(document, ["og:description", "description", "twitter:description"])
  const siteName = getMetaContent(document, ["og:site_name", "twitter:site"])
  const content = extractPageContent(parseHtml(html), PAGE_CONTENT_LIMIT)

  const parts = [`URL: ${url}`, `Host: ${new URL(url).host}`]
  if (title) parts.push(`Title: ${title}`)
  if (description) parts.push(`Description: ${description}`)
  if (siteName) parts.push(`Site: ${siteName}`)
  if (content) parts.push("", "Page content:", content)

  console.log(`\n=== ${url}`)
  console.log(`  title    : ${title ?? "-"}`)
  console.log(`  content  : ${content ? `${content.length} chars` : "none"}`)

  const result = await enrich(parts.join("\n"))

  if (typeof result === "string") {
    console.log(`  failed   : ${result}`)
    continue
  }

  console.log(`  tags     : ${result.tags?.join(", ") ?? "null"}`)
  console.log(
    `  summary  : ${result.summary ?? "null"} (${result.summary?.length ?? 0} chars)`,
  )
}

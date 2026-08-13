import { parseHTML } from "linkedom"

export type HtmlDocument = ReturnType<typeof parseHTML>["document"]

export const parseHtml = (html: string): HtmlDocument => parseHTML(html).document

const collapseWhitespace = (value: string) => value.replace(/\s+/g, " ").trim()

/**
 * Read the content of `<meta property="...">` or `<meta name="...">` for the
 * first matching key, in order of preference. Whitespace is collapsed.
 */
export const getMetaContent = (
  document: HtmlDocument,
  names: ReadonlyArray<string>,
): string | undefined => {
  for (const name of names) {
    const lower = name.toLowerCase()
    const meta =
      document.querySelector(`meta[property="${lower}" i]`) ??
      document.querySelector(`meta[name="${lower}" i]`)
    const content = meta?.getAttribute("content")
    if (content) {
      const collapsed = collapseWhitespace(content)
      if (collapsed) return collapsed
    }
  }
}

/**
 * Read the first `<link rel="...">` href whose rel-list includes the requested
 * value (rel may be space-separated like `"icon stylesheet"`).
 */
export const getLinkHref = (
  document: HtmlDocument,
  rel: string,
): string | undefined => {
  const expected = rel.toLowerCase()
  for (const link of document.querySelectorAll("link[rel][href]")) {
    const rels = (link.getAttribute("rel") ?? "")
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean)
    if (rels.includes(expected)) {
      const href = link.getAttribute("href")?.trim()
      if (href) return href
    }
  }
}

/**
 * Read `<title>` content, with whitespace collapsed.
 */
export const getTitle = (document: HtmlDocument): string | undefined => {
  const text = document.querySelector("title")?.textContent
  if (!text) return undefined
  const collapsed = collapseWhitespace(text)
  return collapsed.length > 0 ? collapsed : undefined
}

const CHROME_SELECTOR =
  "script, style, noscript, template, svg, iframe, form, nav, header, footer, aside, " +
  "[role=navigation], [role=banner], [role=contentinfo], [aria-hidden=true]"

const MAIN_SELECTORS = ["article", "main", "[role=main]", "body"] as const

/**
 * Read the visible body text of a page as one whitespace-collapsed string,
 * truncated to `maxChars`. Site chrome (scripts, navigation, headers, footers)
 * is removed first, and the densest of `article` / `main` / `body` wins, so the
 * result is the page's own prose rather than the menu labels around it.
 *
 * The document is mutated, so pass a document that is not reused afterwards.
 */
export const extractPageContent = (
  document: HtmlDocument,
  maxChars: number,
): string | undefined => {
  for (const node of document.querySelectorAll(CHROME_SELECTOR)) {
    node.remove()
  }

  let best = ""
  for (const selector of MAIN_SELECTORS) {
    const text = collapseWhitespace(
      document.querySelector(selector)?.textContent ?? "",
    )
    if (text.length > best.length) best = text
    // An article or main region is authoritative once it carries real prose.
    if (best.length > 600) break
  }

  if (best.length === 0) return undefined
  return best.length > maxChars ? `${best.slice(0, maxChars).trimEnd()}…` : best
}

/**
 * Decode HTML entities in a plain-text string. Use only when you have a string
 * extracted from outside the DOM (e.g. JSON payload). Anything coming out of
 * `getMetaContent` / `getTitle` / `getAttribute` is already decoded.
 */
export const decodeEntities = (text: string): string => {
  const document = parseHtml("<x></x>")
  const node = document.querySelector("x")
  if (!node) return text
  node.innerHTML = text
  return node.textContent ?? text
}

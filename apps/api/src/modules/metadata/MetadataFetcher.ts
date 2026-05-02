import { Context, Data, Effect, Layer, Option, Schema } from "effect"

import { PageDocument } from "../fetch/PageFetcher.js"

export class Metadata extends Schema.Class<Metadata>("Metadata")({
  url: Schema.String,
  title: Schema.String,
  description: Schema.optional(Schema.String),
  siteName: Schema.optional(Schema.String),
  faviconUrl: Schema.optional(Schema.String),
  faviconLightUrl: Schema.optional(Schema.String),
  faviconDarkUrl: Schema.optional(Schema.String),
  imageUrl: Schema.optional(Schema.String),
  canonicalUrl: Schema.optional(Schema.String),
}) { }

export class MetadataFetcherError extends Data.TaggedError("MetadataFetcherError")<{
  readonly operation: string
  readonly url: string
  readonly cause: unknown
}> {}

export class MetadataFetcher extends Context.Service<MetadataFetcher>()(
  "@app/modules/metadata/MetadataFetcher",
  {
    make: Effect.succeed({
      parse: (page: PageDocument) =>
        Effect.try({
          try: () => buildMetadata(page),
          catch: (cause) =>
            new MetadataFetcherError({
              operation: "parse",
              url: page.finalUrl,
              cause,
            }),
        }),
    }),
  },
) {
  static readonly layer = Layer.effect(MetadataFetcher, MetadataFetcher.make)
}

const namedHtmlEntities: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: "\"",
  apos: "'",
  nbsp: " ",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  sbquo: "‚",
  bdquo: "„",
  mdash: "—",
  ndash: "–",
  hellip: "…",
  copy: "©",
  reg: "®",
  trade: "™",
  laquo: "«",
  raquo: "»",
  middot: "·",
  bull: "•",
}

const decodeHtmlEntities = (value: string) =>
  value.replace(
    /&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi,
    (match, body: string) => {
      const lower = body.toLowerCase()

      if (lower.startsWith("#x")) {
        const code = Number.parseInt(lower.slice(2), 16)
        return Number.isFinite(code) ? String.fromCodePoint(code) : match
      }

      if (lower.startsWith("#")) {
        const code = Number.parseInt(lower.slice(1), 10)
        return Number.isFinite(code) ? String.fromCodePoint(code) : match
      }

      return namedHtmlEntities[lower] ?? match
    },
  )

const normalizeText = (value: string) =>
  decodeHtmlEntities(value).replace(/\s+/g, " ").trim()

const parseAttributes = (tag: string): Record<string, string> => {
  const attributes: Record<string, string> = {}

  for (const match of tag.matchAll(/([a-zA-Z:-]+)\s*=\s*(['"])(.*?)\2/gs)) {
    attributes[match[1]!.toLowerCase()] = normalizeText(match[3]!)
  }

  return attributes
}

const findMetaContent = (html: string, keys: readonly string[]) => {
  const normalizedKeys = new Set(keys.map((key) => key.toLowerCase()))

  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attributes = parseAttributes(match[0])
    const key = (attributes.property ?? attributes.name)?.toLowerCase()

    if (key && normalizedKeys.has(key) && attributes.content) {
      return attributes.content
    }
  }
}

const findLinkHref = (html: string, rel: string) => {
  const expectedRel = rel.toLowerCase()

  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const attributes = parseAttributes(match[0])
    const relValues = (attributes.rel ?? "")
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean)

    if (relValues.includes(expectedRel) && attributes.href) {
      return attributes.href
    }
  }
}

type FaviconCandidate = {
  readonly url: string
  readonly rel: string
  readonly media?: string
  readonly type?: string
  readonly sizes?: string
}

type PreferredColorScheme = "light" | "dark"

const findFaviconCandidates = (html: string, baseUrl: string) => {
  const candidates: Array<FaviconCandidate> = []

  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const attributes = parseAttributes(match[0])
    const rel = (attributes.rel ?? "").toLowerCase()

    if (!rel) {
      continue
    }

    const relValues = rel.split(/\s+/).filter(Boolean)
    const isStandardIcon = relValues.includes("icon")
    const isAppleTouchIcon = rel.startsWith("apple-touch-icon")
    const isMaskIcon = relValues.includes("mask-icon")

    if ((!isStandardIcon && !isAppleTouchIcon) || isMaskIcon) {
      continue
    }

    const url = toAbsoluteUrl(attributes.href, baseUrl)
    if (!url) {
      continue
    }

    candidates.push({
      url,
      rel,
      media: attributes.media?.toLowerCase(),
      type: attributes.type?.toLowerCase(),
      sizes: attributes.sizes?.toLowerCase(),
    })
  }

  return candidates
}

const parseMediaColorScheme = (media: string | undefined): PreferredColorScheme | undefined => {
  if (!media) {
    return
  }

  const normalized = media.toLowerCase()
  if (!normalized.includes("prefers-color-scheme")) {
    return
  }

  if (normalized.includes("dark")) {
    return "dark"
  }

  if (normalized.includes("light")) {
    return "light"
  }
}

const parseLargestIconSize = (sizes: string | undefined) => {
  if (!sizes || sizes === "any") {
    return 0
  }

  let largest = 0
  for (const size of sizes.split(/\s+/)) {
    const match = size.match(/^(\d+)x(\d+)$/)
    if (!match) {
      continue
    }

    const width = Number.parseInt(match[1]!, 10)
    const height = Number.parseInt(match[2]!, 10)
    largest = Math.max(largest, width, height)
  }

  return largest
}

const inferIconType = (candidate: FaviconCandidate) => {
  if (candidate.type) {
    return candidate.type
  }

  try {
    const pathname = new URL(candidate.url).pathname.toLowerCase()
    if (pathname.endsWith(".png")) return "image/png"
    if (pathname.endsWith(".ico")) return "image/x-icon"
    if (pathname.endsWith(".svg")) return "image/svg+xml"
    if (pathname.endsWith(".gif")) return "image/gif"
    if (pathname.endsWith(".jpg") || pathname.endsWith(".jpeg")) return "image/jpeg"
    if (pathname.endsWith(".webp")) return "image/webp"
  } catch {
    return
  }
}

const iconTypeScore = (candidate: FaviconCandidate) => {
  const type = inferIconType(candidate)

  switch (type) {
    case "image/png":
      return 8
    case "image/x-icon":
    case "image/vnd.microsoft.icon":
      return 7
    case "image/webp":
    case "image/gif":
    case "image/jpeg":
      return 6
    case "image/svg+xml":
      return 2
    default:
      return 4
  }
}

const mediaScore = (
  candidate: FaviconCandidate,
  scheme: PreferredColorScheme | undefined,
) => {
  const candidateScheme = parseMediaColorScheme(candidate.media)

  if (!scheme) {
    if (!candidate.media || candidateScheme === undefined) {
      return 30
    }

    return candidateScheme === "light" ? 20 : 10
  }

  if (candidateScheme === scheme) {
    return 40
  }

  if (candidate.media === undefined || candidateScheme === undefined) {
    return 24
  }

  return 0
}

const relScore = (candidate: FaviconCandidate) => {
  if (candidate.rel.split(/\s+/).includes("icon")) {
    return 4
  }

  if (candidate.rel.startsWith("apple-touch-icon")) {
    return 2
  }

  return 0
}

const chooseFavicon = (
  candidates: ReadonlyArray<FaviconCandidate>,
  scheme: PreferredColorScheme | undefined,
) => {
  const fallback = (() => {
    const generic = candidates.find((candidate) => !candidate.media)
    return generic ?? candidates[0]
  })()

  return candidates.reduce<FaviconCandidate | undefined>((best, candidate) => {
    const score =
      mediaScore(candidate, scheme) * 10_000 +
      iconTypeScore(candidate) * 1_000 +
      Math.min(parseLargestIconSize(candidate.sizes), 512) +
      relScore(candidate) * 10

    if (!best) {
      return candidate
    }

    const bestScore =
      mediaScore(best, scheme) * 10_000 +
      iconTypeScore(best) * 1_000 +
      Math.min(parseLargestIconSize(best.sizes), 512) +
      relScore(best) * 10

    return score >= bestScore ? candidate : best
  }, fallback)
}

const findTitle = (html: string) => {
  const match = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)
  return match?.[1] ? normalizeText(match[1]) : undefined
}

const toAbsoluteUrl = (candidate: string | undefined, baseUrl: string) => {
  if (!candidate) {
    return
  }

  try {
    return new URL(candidate, baseUrl).toString()
  } catch {
    return
  }
}

const buildMetadata = (page: PageDocument) => {
  const url = page.finalUrl
  const html = page.html
  const title =
    findMetaContent(html, ["og:title", "twitter:title"]) ?? findTitle(html)
  const description = findMetaContent(html, [
    "og:description",
    "description",
    "twitter:description",
  ])
  const siteName = findMetaContent(html, ["og:site_name", "twitter:site"])
  const faviconCandidates = findFaviconCandidates(html, url)
  const imageUrl = toAbsoluteUrl(
    findMetaContent(html, ["og:image", "twitter:image"]),
    url,
  )
  const canonicalUrl = toAbsoluteUrl(findLinkHref(html, "canonical"), url)
  const faviconUrl = chooseFavicon(faviconCandidates, undefined)?.url
    ?? toAbsoluteUrl("/favicon.ico", url)
  const faviconLightUrl = chooseFavicon(faviconCandidates, "light")?.url
  const faviconDarkUrl = chooseFavicon(faviconCandidates, "dark")?.url

  if (!title && !description && !siteName && !faviconUrl && !imageUrl && !canonicalUrl) {
    return Option.none<Metadata>()
  }

  const fallbackTitle = (() => {
    try {
      return new URL(url).hostname
    } catch {
      return url
    }
  })()

  return Option.some(
    new Metadata({
      url,
      title: title ?? fallbackTitle,
      description,
      siteName,
      faviconUrl,
      faviconLightUrl,
      faviconDarkUrl,
      imageUrl,
      canonicalUrl,
    }),
  )
}

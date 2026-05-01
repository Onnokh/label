import { Context, Data, Effect, Layer, Option, Schema } from "effect"

import { PageDocument } from "../fetch/PageFetcher.js"

export class Metadata extends Schema.Class<Metadata>("Metadata")({
  url: Schema.String,
  title: Schema.String,
  description: Schema.optional(Schema.String),
  siteName: Schema.optional(Schema.String),
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

const decodeHtmlEntities = (value: string) =>
  value
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/&nbsp;/gi, " ")

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
  const imageUrl = toAbsoluteUrl(
    findMetaContent(html, ["og:image", "twitter:image"]),
    url,
  )
  const canonicalUrl = toAbsoluteUrl(findLinkHref(html, "canonical"), url)

  if (!title && !description && !siteName && !imageUrl && !canonicalUrl) {
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
      imageUrl,
      canonicalUrl,
    }),
  )
}

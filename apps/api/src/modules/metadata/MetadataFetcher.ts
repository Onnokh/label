import { Context, Data, Effect, Layer, Option, Schema } from "effect"

import { stripBrandSuffix } from "../../lib/strip-brand.js"
import {
  extractPageContent,
  getLinkHref,
  getMetaContent,
  getTitle,
  parseHtml,
} from "../../lib/html.js"
import { toAbsoluteUrl } from "../../lib/url.js"
import { PageDocument } from "../fetch/PageFetcher.js"
import { chooseFavicon, findFaviconCandidates } from "./Favicon.js"

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
  // The Link Author. Only a provider that states the writer fills these in; page
  // markup is not read for them, because the common author meta tags carry a
  // profile URL as often as a name.
  authorName: Schema.optional(Schema.String),
  authorHandle: Schema.optional(Schema.String),
  authorAvatarUrl: Schema.optional(Schema.String),
}) { }

/**
 * Enough Extracted Page Content for a Preview Summary without paying for a
 * whole page: roughly the first 500 words, which covers the lede of most
 * articles and the opening of a README.
 */
export const PAGE_CONTENT_LIMIT = 2000

export class MetadataFetcherError extends Data.TaggedError("MetadataFetcherError")<{
  readonly operation: string
  readonly url: string
  readonly cause: unknown
}> {}

export class MetadataFetcher extends Context.Service<MetadataFetcher>()(
  "@app/modules/metadata/MetadataFetcher",
  {
    make: Effect.succeed({
      parse: Effect.fn("MetadataFetcher.parse")(function* (page: PageDocument) {
        yield* Effect.annotateCurrentSpan("url", page.finalUrl)
        return yield* Effect.try({
          try: () => buildMetadata(page),
          catch: (cause) =>
            new MetadataFetcherError({
              operation: "parse",
              url: page.finalUrl,
              cause,
            }),
        })
      }),

      /** Extracted Page Content, for AI Enrichment to summarize. */
      extractContent: Effect.fn("MetadataFetcher.extractContent")(function* (
        page: PageDocument,
      ) {
        yield* Effect.annotateCurrentSpan("url", page.finalUrl)
        return yield* Effect.try({
          try: () => {
            const text = extractPageContent(parseHtml(page.html), PAGE_CONTENT_LIMIT)
            return text ? Option.some(text) : Option.none<string>()
          },
          catch: (cause) =>
            new MetadataFetcherError({
              operation: "extractContent",
              url: page.finalUrl,
              cause,
            }),
        })
      }),
    }),
  },
) {
  static readonly layer = Layer.effect(MetadataFetcher, MetadataFetcher.make)
}

const buildMetadata = (page: PageDocument) => {
  const url = page.finalUrl
  const document = parseHtml(page.html)

  const title =
    getMetaContent(document, ["og:title", "twitter:title"]) ?? getTitle(document)
  const description = getMetaContent(document, [
    "og:description",
    "description",
    "twitter:description",
  ])
  const siteName = getMetaContent(document, ["og:site_name", "twitter:site"])
  const faviconCandidates = findFaviconCandidates(document, url)
  const imageUrl = toAbsoluteUrl(
    getMetaContent(document, ["og:image", "twitter:image"]),
    url,
  )
  const canonicalUrl = toAbsoluteUrl(getLinkHref(document, "canonical"), url)
  const faviconUrl =
    chooseFavicon(faviconCandidates, undefined)?.url ??
    toAbsoluteUrl("/favicon.ico", url)
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

  const cleanedTitle = title ? stripBrandSuffix(title, siteName, url) : undefined

  return Option.some(
    new Metadata({
      url,
      title: cleanedTitle ?? fallbackTitle,
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

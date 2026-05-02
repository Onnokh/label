import { Context, Data, Effect, Layer, Option, Result } from "effect"

import { PageFetcher } from "../fetch/PageFetcher.js"
import { Metadata, MetadataFetcher } from "./MetadataFetcher.js"

type OEmbedResponse = {
  title?: unknown
  author_name?: unknown
  thumbnail_url?: unknown
  provider_name?: unknown
  html?: unknown
}

type Provider = {
  readonly pattern: RegExp
  readonly endpoint: string
  readonly isTweet?: boolean
}

const PROVIDERS: ReadonlyArray<Provider> = [
  {
    pattern: /^https?:\/\/(www\.)?(youtube\.com\/(watch|shorts)|youtu\.be\/)/,
    endpoint: "https://www.youtube.com/oembed",
  },
  {
    pattern: /^https?:\/\/(www\.)?vimeo\.com\/\d+/,
    endpoint: "https://vimeo.com/api/oembed.json",
  },
  {
    pattern: /^https?:\/\/(www\.)?(twitter\.com|x\.com)\/\w+\/status\//,
    endpoint: "https://publish.twitter.com/oembed",
    isTweet: true,
  },
]

const getProvider = (url: string): Provider | undefined => {
  for (const provider of PROVIDERS) {
    if (provider.pattern.test(url)) return provider
  }
  return undefined
}

const extractTweetText = (html: string): string | undefined => {
  const match = html.match(/<p[^>]*>([\s\S]*?)<\/p>/i)
  if (!match?.[1]) return undefined
  return match[1]
    .replace(/<a\b[^>]*>https?:\/\/t\.co\/[^\s<]*<\/a>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim() || undefined
}

const extractFirstTcoUrl = (html: string): string | undefined =>
  html.match(/<a\b[^>]+href="(https?:\/\/t\.co\/[^\s"]+)"/i)?.[1]

class OEmbedFetcherError extends Data.TaggedError("OEmbedFetcherError")<{
  readonly cause: unknown
}> {}

export class OEmbedFetcher extends Context.Service<OEmbedFetcher>()(
  "@app/modules/metadata/OEmbedFetcher",
  {
    make: Effect.gen(function* () {
      const pageFetcher = yield* PageFetcher
      const metadataFetcher = yield* MetadataFetcher

      const fetchTitleFromUrl = (url: string): Effect.Effect<string | undefined, never> =>
        Effect.gen(function* () {
          const pageResult = yield* Effect.all(
            [pageFetcher.fetchWithBrowser(url, {
              // Wait until og:title is populated — handles JS-rendered SPAs like X.com
              waitForFn: "!!document.querySelector('meta[property=\"og:title\"]')?.getAttribute('content')",
            })],
            { mode: "result" },
          ).pipe(Effect.map(([r]) => r))

          if (Result.isFailure(pageResult)) return undefined

          const pageOption = pageResult.success
          if (Option.isNone(pageOption)) return undefined

          const metadataResult = yield* Effect.all(
            [metadataFetcher.parse(pageOption.value)],
            { mode: "result" },
          ).pipe(Effect.map(([r]) => r))

          if (Result.isFailure(metadataResult)) return undefined

          const metadataOption = metadataResult.success
          if (Option.isNone(metadataOption)) return undefined

          return metadataOption.value.title || undefined
        })

      const resolveTweetTitle = (
        json: OEmbedResponse,
      ): Effect.Effect<string | undefined, never> =>
        Effect.gen(function* () {
          const html = typeof json.html === "string" ? json.html : undefined
          if (!html) return undefined

          const text = extractTweetText(html)
          if (text) return text

          const tcoUrl = extractFirstTcoUrl(html)
          if (tcoUrl) {
            const linked = yield* fetchTitleFromUrl(tcoUrl)
            if (linked) return linked
          }

          const authorName = typeof json.author_name === "string" ? json.author_name.trim() : undefined
          return authorName ? `Post by ${authorName}` : undefined
        })

      return {
        fetch: (url: string): Effect.Effect<Option.Option<Metadata>, never> => {
          const provider = getProvider(url)
          if (!provider) return Effect.succeed(Option.none())

          const oEmbedUrl = `${provider.endpoint}?url=${encodeURIComponent(url)}&format=json`

          const fetchEffect = Effect.tryPromise({
            try: async () => {
              const response = await fetch(oEmbedUrl, {
                headers: { accept: "application/json" },
              })
              if (!response.ok) return Option.none<OEmbedResponse>()
              return Option.some(await response.json() as OEmbedResponse)
            },
            catch: (cause) => new OEmbedFetcherError({ cause }),
          })

          return Effect.gen(function* () {
            const fetchResult = yield* Effect.all([fetchEffect], { mode: "result" }).pipe(
              Effect.map(([r]) => r),
            )

            if (Result.isFailure(fetchResult)) return Option.none<Metadata>()

            const jsonOption = fetchResult.success
            if (Option.isNone(jsonOption)) return Option.none<Metadata>()

            const json = jsonOption.value

            const title = provider.isTweet
              ? yield* resolveTweetTitle(json)
              : typeof json.title === "string" ? json.title.trim() : undefined

            if (!title) return Option.none<Metadata>()

            return Option.some(
              new Metadata({
                url,
                title,
                siteName: typeof json.provider_name === "string" ? json.provider_name : undefined,
                imageUrl: typeof json.thumbnail_url === "string" ? json.thumbnail_url : undefined,
              }),
            )
          })
        },
      }
    }),
  },
) {
  static readonly layer = Layer.effect(OEmbedFetcher, OEmbedFetcher.make)
}

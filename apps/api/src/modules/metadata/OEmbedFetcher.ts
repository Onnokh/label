import { Context, Data, Effect, Layer, Option, Result } from "effect"

import { stripBrandSuffix } from "../../lib/strip-brand.js"
import { Metadata } from "./MetadataFetcher.js"

type ProviderMetadata = {
  readonly title: string
  readonly siteName?: string | undefined
  readonly imageUrl?: string | undefined
  readonly description?: string | undefined
  readonly authorName?: string | undefined
  readonly authorHandle?: string | undefined
  readonly authorAvatarUrl?: string | undefined
}

type ProviderResolver = (url: string) => Promise<ProviderMetadata | undefined>

type Provider = {
  readonly name: string
  readonly pattern: RegExp
  readonly resolve: ProviderResolver
}

class OEmbedFetcherError extends Data.TaggedError("OEmbedFetcherError")<{
  readonly cause: unknown
}> {}

type OEmbedResponse = {
  title?: unknown
  author_name?: unknown
  thumbnail_url?: unknown
  provider_name?: unknown
  html?: unknown
}

const fetchJson = async <T>(url: string): Promise<T | undefined> => {
  const response = await fetch(url, {
    headers: { accept: "application/json" },
    redirect: "follow",
  })
  if (!response.ok) return undefined
  return (await response.json()) as T
}

const asString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined

const oEmbedResolver = (endpoint: string): ProviderResolver => async (url) => {
  const json = await fetchJson<OEmbedResponse>(
    `${endpoint}?url=${encodeURIComponent(url)}&format=json`,
  )
  if (!json) return undefined

  const title = asString(json.title)
  if (!title) return undefined

  return {
    title,
    siteName: asString(json.provider_name),
    imageUrl: asString(json.thumbnail_url),
  }
}

type FxTwitterResponse = {
  readonly code?: number
  readonly tweet?: {
    readonly text?: unknown
    readonly author?: {
      readonly name?: unknown
      readonly screen_name?: unknown
      readonly avatar_url?: unknown
    }
    readonly media?: {
      readonly photos?: ReadonlyArray<{ readonly url?: unknown }>
      readonly videos?: ReadonlyArray<{ readonly thumbnail_url?: unknown }>
    }
  }
}

const twitterResolver: ProviderResolver = async (url) => {
  // publish.twitter.com/oembed was discontinued post-acquisition; fxtwitter
  // is a community-run proxy that mirrors the public tweet payload as JSON.
  const path = url.replace(/^https?:\/\/(www\.)?(twitter\.com|x\.com)/i, "")
  const json = await fetchJson<FxTwitterResponse>(`https://api.fxtwitter.com${path}`)
  const tweet = json?.tweet
  if (!tweet) return undefined

  const text = asString(tweet.text)
  const authorName = asString(tweet.author?.name)
  const handle = asString(tweet.author?.screen_name)
  const title = text ?? (authorName ? `Post by ${authorName}` : undefined)
  if (!title) return undefined

  const photo = tweet.media?.photos?.[0]?.url
  const videoThumb = tweet.media?.videos?.[0]?.thumbnail_url

  return {
    title,
    // The Site Name stays the author handle. It is what the iOS app and the
    // Library already show as the source of a saved tweet, and the Link Author
    // below is additive rather than a replacement for it.
    siteName: handle ? `@${handle}` : "X",
    imageUrl: asString(photo) ?? asString(videoThumb),
    authorName,
    authorHandle: handle ? `@${handle}` : undefined,
    authorAvatarUrl: asString(tweet.author?.avatar_url),
  }
}

const PROVIDERS: ReadonlyArray<Provider> = [
  {
    name: "youtube",
    pattern: /^https?:\/\/(www\.|m\.)?(youtube\.com\/(watch|shorts)|youtu\.be\/)/i,
    resolve: oEmbedResolver("https://www.youtube.com/oembed"),
  },
  {
    name: "vimeo",
    pattern: /^https?:\/\/(www\.)?vimeo\.com\/\d+/i,
    resolve: oEmbedResolver("https://vimeo.com/api/oembed.json"),
  },
  {
    name: "twitter",
    pattern: /^https?:\/\/(www\.)?(twitter\.com|x\.com)\/[^/]+\/status\//i,
    resolve: twitterResolver,
  },
]

const findProvider = (url: string): Provider | undefined =>
  PROVIDERS.find((provider) => provider.pattern.test(url))

export class OEmbedFetcher extends Context.Service<OEmbedFetcher>()(
  "@app/modules/metadata/OEmbedFetcher",
  {
    make: Effect.succeed({
      fetch: Effect.fn("OEmbedFetcher.fetch")(function* (url: string) {
        yield* Effect.annotateCurrentSpan("url", url)
        const provider = findProvider(url)
        if (!provider) return Option.none<Metadata>()

        const resolveEffect = Effect.tryPromise({
          try: () => provider.resolve(url),
          catch: (cause) => new OEmbedFetcherError({ cause }),
        })

        return yield* Effect.gen(function* () {
          const result = yield* Effect.all([resolveEffect], { mode: "result" }).pipe(
            Effect.map(([r]) => r),
          )

          if (Result.isFailure(result)) {
            yield* Effect.logWarning("provider metadata lookup failed", {
              provider: provider.name,
              url,
              cause: String(result.failure.cause),
            })
            return Option.none<Metadata>()
          }

          const fields = result.success
          if (!fields) {
            yield* Effect.logWarning("provider returned no metadata", {
              provider: provider.name,
              url,
            })
            return Option.none<Metadata>()
          }

          yield* Effect.logInfo("provider metadata resolved", {
            provider: provider.name,
            url,
          })

          return Option.some(
            new Metadata({
              url,
              title: stripBrandSuffix(fields.title, fields.siteName, url),
              description: fields.description,
              siteName: fields.siteName,
              imageUrl: fields.imageUrl,
              authorName: fields.authorName,
              authorHandle: fields.authorHandle,
              authorAvatarUrl: fields.authorAvatarUrl,
            }),
          )
        })
      }),
    }),
  },
) {
  static readonly layer = Layer.effect(OEmbedFetcher, OEmbedFetcher.make)
}

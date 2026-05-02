import { Context, Data, Effect, Layer, Option, Result } from "effect"

import { Metadata } from "./MetadataFetcher.js"

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
  readonly fetchTitle?: (json: OEmbedResponse) => Promise<string | undefined>
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

const JS_REQUIRED_HOSTS = new Set(["x.com", "twitter.com", "instagram.com"])

const fetchLinkedTitle = async (url: string): Promise<string | undefined> => {
  try {
    const response = await fetch(url, {
      redirect: "follow",
      headers: {
        accept: "text/html",
        "user-agent": "Mozilla/5.0 (compatible; bot/1.0)",
      },
    })
    if (!response.ok) return undefined
    // Skip hosts that require JS — plain HTML won't have a meaningful title
    const finalHost = new URL(response.url).hostname.replace(/^www\./, "")
    if (JS_REQUIRED_HOSTS.has(finalHost)) return undefined
    const html = await response.text()
    return (
      html.match(/<meta\b[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1]
      ?? html.match(/<meta\b[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i)?.[1]
      ?? html.match(/<title\b[^>]*>([^<]+)<\/title>/i)?.[1]
    )?.replace(/\s+/g, " ").trim() || undefined
  } catch {
    return undefined
  }
}

const fetchTweetTitle = async (json: OEmbedResponse): Promise<string | undefined> => {
  const html = typeof json.html === "string" ? json.html : undefined
  if (!html) return undefined

  const text = extractTweetText(html)
  if (text) return text

  // Tweet is a shared link — follow the t.co URL to get the linked page title
  const tcoUrl = extractFirstTcoUrl(html)
  if (tcoUrl) {
    const linkedTitle = await fetchLinkedTitle(tcoUrl)
    if (linkedTitle) return linkedTitle
  }

  const authorName = typeof json.author_name === "string" ? json.author_name.trim() : undefined
  return authorName ? `Post by ${authorName}` : undefined
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
    fetchTitle: fetchTweetTitle,
  },
]

const getProvider = (url: string): Provider | undefined => {
  for (const provider of PROVIDERS) {
    if (provider.pattern.test(url)) return provider
  }
  return undefined
}

class OEmbedFetcherError extends Data.TaggedError("OEmbedFetcherError")<{
  readonly cause: unknown
}> {}

export class OEmbedFetcher extends Context.Service<OEmbedFetcher>()(
  "@app/modules/metadata/OEmbedFetcher",
  {
    make: Effect.succeed({
      fetch: (url: string): Effect.Effect<Option.Option<Metadata>, never> => {
        const provider = getProvider(url)

        if (!provider) {
          return Effect.succeed(Option.none())
        }

        const oEmbedUrl = `${provider.endpoint}?url=${encodeURIComponent(url)}&format=json`

        const fetchEffect = Effect.tryPromise({
          try: async () => {
            const response = await fetch(oEmbedUrl, {
              headers: { accept: "application/json" },
            })

            if (!response.ok) {
              return Option.none<Metadata>()
            }

            const json = await response.json() as OEmbedResponse

            const title = provider.fetchTitle
              ? await provider.fetchTitle(json)
              : typeof json.title === "string" ? json.title.trim() : undefined

            if (!title) {
              return Option.none<Metadata>()
            }

            return Option.some(
              new Metadata({
                url,
                title,
                siteName: typeof json.provider_name === "string" ? json.provider_name : undefined,
                imageUrl: typeof json.thumbnail_url === "string" ? json.thumbnail_url : undefined,
              }),
            )
          },
          catch: (cause) => new OEmbedFetcherError({ cause }),
        })

        return Effect.gen(function* () {
          const result = yield* Effect.all([fetchEffect], { mode: "result" }).pipe(
            Effect.map(([r]) => r),
          )

          if (Result.isFailure(result)) {
            return Option.none<Metadata>()
          }

          return result.success
        })
      },
    }),
  },
) {
  static readonly layer = Layer.effect(OEmbedFetcher, OEmbedFetcher.make)
}

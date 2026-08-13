import { describe, expect } from "bun:test"
import { Effect, Option } from "effect"

import { PageDocument } from "../../src/modules/fetch/PageDocument.js"
import { MetadataFetcher } from "../../src/modules/metadata/MetadataFetcher.js"
import { testEffect } from "../lib/effect.js"

const it = testEffect(MetadataFetcher.layer)

const page = (html: string) =>
  new PageDocument({
    requestedUrl: "https://example.com/articles/testing",
    finalUrl: "https://example.com/articles/testing",
    contentType: "text/html",
    fetchedAt: new Date("2026-05-19T12:00:00.000Z"),
    html,
  })

describe("MetadataFetcher", () => {
  it.effect("extracts metadata used by saved item enrichment", () =>
    Effect.gen(function* () {
      const fetcher = yield* MetadataFetcher
      const result = yield* fetcher.parse(page([
        "<!doctype html>",
        "<title>Testing Effect APIs - Example Docs</title>",
        '<meta name="description" content="How to keep an Effect API working.">',
        '<meta property="og:site_name" content="Example Docs">',
        '<meta property="og:image" content="/cover.png">',
        '<link rel="canonical" href="/canonical">',
        '<link rel="icon" href="/favicon.svg">',
      ].join("")))

      expect(Option.isSome(result)).toBe(true)
      if (Option.isNone(result)) return

      expect(result.value.title).toBe("Testing Effect APIs")
      expect(result.value.description).toBe("How to keep an Effect API working.")
      expect(result.value.siteName).toBe("Example Docs")
      expect(result.value.imageUrl).toBe("https://example.com/cover.png")
      expect(result.value.canonicalUrl).toBe("https://example.com/canonical")
      expect(result.value.faviconUrl).toBe("https://example.com/favicon.svg")
    }),
  )

  it.effect("extracts the page prose and leaves out the site chrome", () =>
    Effect.gen(function* () {
      const fetcher = yield* MetadataFetcher
      const result = yield* fetcher.extractContent(page([
        "<!doctype html>",
        "<body>",
        "<nav>Home Docs Pricing</nav>",
        "<script>console.log('tracking')</script>",
        "<article><h1>Monomorphic call sites</h1>",
        "<p>Keeping one object shape per call site lets the engine inline the",
        " property lookup instead of walking a megamorphic cache.</p></article>",
        "<footer>Cookie notice</footer>",
        "</body>",
      ].join("")))

      expect(Option.isSome(result)).toBe(true)
      if (Option.isNone(result)) return

      expect(result.value).toContain("Monomorphic call sites")
      expect(result.value).toContain("inline the property lookup")
      expect(result.value).not.toContain("Pricing")
      expect(result.value).not.toContain("tracking")
      expect(result.value).not.toContain("Cookie notice")
    }),
  )

  it.effect("reports no page content for an empty document", () =>
    Effect.gen(function* () {
      const fetcher = yield* MetadataFetcher
      const result = yield* fetcher.extractContent(page("<!doctype html><body></body>"))

      expect(Option.isNone(result)).toBe(true)
    }),
  )

  it.effect("falls back to the host when only favicon metadata is available", () =>
    Effect.gen(function* () {
      const fetcher = yield* MetadataFetcher
      const result = yield* fetcher.parse(page("<!doctype html>"))

      expect(Option.isSome(result)).toBe(true)
      if (Option.isNone(result)) return

      expect(result.value.title).toBe("example.com")
      expect(result.value.faviconUrl).toBe("https://example.com/favicon.ico")
    }),
  )
})

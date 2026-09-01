import { describe, expect } from "bun:test"
import { Effect, Layer } from "effect"

import { AppConfig } from "../../src/runtime/Config.js"
import { PublicProfileCachePurger } from "../../src/modules/profiles/PublicProfileCachePurger.js"
import { it } from "../lib/effect.js"

const config = (cache: {
  readonly cloudflareZoneId: string
  readonly cloudflarePurgeApiToken: string
}) => Layer.succeed(AppConfig, AppConfig.of({
  database: { url: "" },
  redis: { url: "" },
  render: { token: "" },
  http: { port: 0 },
  fetch: {
    timeoutMs: 5_000,
    userAgent: "test",
    browserFallbackEnabled: false,
    browserTimeoutMs: 5_000,
    cloudflareAccountId: "",
    cloudflareApiToken: "",
  },
  cache,
  ai: { enabled: false, provider: undefined, model: undefined, apiKey: undefined },
  auth: {
    googleClientId: "",
    googleClientSecret: "",
    appleClientId: "",
    appleTeamId: "",
    appleKeyId: "",
    applePrivateKey: "",
    appleAppBundleIdentifier: "",
    secret: "test",
    baseUrl: "http://localhost",
    webUrl: "http://localhost",
    trustedOrigins: [],
  },
  rybbit: { enabled: false, apiUrl: "", siteId: "", apiKey: "" },
}))

describe("PublicProfileCachePurger", () => {
  it.effect("purges one profile by cache tag", () => {
    const originalFetch = globalThis.fetch
    let request: Request | undefined
    let requestBody: BodyInit | null | undefined

    globalThis.fetch = async (input, init) => {
      request = new Request(input, init)
      requestBody = init?.body
      return Response.json({ success: true })
    }

    return Effect.gen(function* () {
      const purger = yield* PublicProfileCachePurger
      yield* purger.purge("onno")

      expect(request?.url).toBe(
        "https://api.cloudflare.com/client/v4/zones/zone-123/purge_cache",
      )
      expect(request?.method).toBe("POST")
      expect(request?.headers.get("authorization")).toBe("Bearer purge-token")
      expect(requestBody).toBe('{"tags":["public-profile:onno"]}')
    }).pipe(
      Effect.provide(PublicProfileCachePurger.layer.pipe(
        Layer.provide(config({
          cloudflareZoneId: "zone-123",
          cloudflarePurgeApiToken: "purge-token",
        })),
      )),
      Effect.ensuring(Effect.sync(() => {
        globalThis.fetch = originalFetch
      })),
    )
  })

  it.effect("does not call Cloudflare when purging is unconfigured", () => {
    const originalFetch = globalThis.fetch
    let called = false
    globalThis.fetch = async () => {
      called = true
      return Response.json({ success: true })
    }

    return Effect.gen(function* () {
      const purger = yield* PublicProfileCachePurger
      yield* purger.purge("onno")
      expect(called).toBe(false)
    }).pipe(
      Effect.provide(PublicProfileCachePurger.layer.pipe(
        Layer.provide(config({ cloudflareZoneId: "", cloudflarePurgeApiToken: "" })),
      )),
      Effect.ensuring(Effect.sync(() => {
        globalThis.fetch = originalFetch
      })),
    )
  })
})

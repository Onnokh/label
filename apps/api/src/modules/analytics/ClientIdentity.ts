import { Effect, Option } from "effect"
import { HttpServerRequest } from "effect/unstable/http"

export type ClientIdentity = {
  readonly ipAddress?: string | undefined
  readonly userAgent?: string | undefined
}

/*
 * The originating visitor's IP and User-Agent for the current request, shaped
 * to spread straight into a `RybbitEvent` so analytics geolocate to the real
 * visitor instead of this server.
 *
 * Reads the request optionally: outside an HTTP request scope (or in local dev,
 * where the headers below are absent) it yields `{}` and analytics fall back to
 * the server IP — so callers never have to thread request context themselves.
 *
 * Behind Cloudflare the visitor IP survives only in `cf-connecting-ip`:
 * `x-forwarded-for` collapses to the Cloudflare edge IP at our proxy (Caddy has
 * no `trusted_proxies`).
 */
export const clientIdentity: Effect.Effect<ClientIdentity> = Effect.gen(function* () {
  const request = yield* Effect.serviceOption(HttpServerRequest.HttpServerRequest)
  if (Option.isNone(request)) return {}
  const { headers } = request.value
  return {
    ipAddress: headers["cf-connecting-ip"],
    userAgent: headers["user-agent"],
  }
})

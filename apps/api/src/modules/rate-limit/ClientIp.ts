import { Option } from "effect"
import { Headers, type HttpServerRequest } from "effect/unstable/http"

const UNKNOWN_CLIENT_IP = "unknown"

const firstAddress = (value: string | undefined): string | undefined => {
  const first = value?.split(",")[0]?.trim()
  return first ? first : undefined
}

// The single client-address rule, stated once over a header lookup so every
// rate limiter buckets requests the same way.
//
// Cloudflare rewrites the forwarded-for chain to its own edge address, so
// CF-Connecting-IP carries the only real visitor address in production. The
// forwarded-for chain and the request address serve deployments without a
// Cloudflare proxy in front of the API.
const resolveClientIp = (
  header: (name: string) => string | undefined,
  remoteAddress: string | undefined,
): string =>
  firstAddress(header("cf-connecting-ip")) ??
    firstAddress(header("x-forwarded-for")) ??
    remoteAddress ??
    UNKNOWN_CLIENT_IP

export const clientIp = (request: HttpServerRequest.HttpServerRequest): string =>
  resolveClientIp(
    (name) => Option.getOrUndefined(Headers.get(request.headers, name)),
    Option.getOrUndefined(request.remoteAddress),
  )

// The same rule for the web-request seam, where rate limits that must add
// response headers run before the Effect router sees the request.
export const webClientIp = (request: Request): string =>
  resolveClientIp((name) => request.headers.get(name) ?? undefined, undefined)

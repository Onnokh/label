import { Option } from "effect"
import { Headers, type HttpServerRequest } from "effect/unstable/http"

const UNKNOWN_CLIENT_IP = "unknown"

const firstAddress = (
  request: HttpServerRequest.HttpServerRequest,
  header: string,
): string | undefined => {
  const value = Option.getOrUndefined(Headers.get(request.headers, header))
  const first = value?.split(",")[0]?.trim()
  return first ? first : undefined
}

// Cloudflare rewrites the forwarded-for chain to its own edge address, so
// CF-Connecting-IP carries the only real visitor address in production. The
// forwarded-for chain and the request address serve deployments without a
// Cloudflare proxy in front of the API.
export const clientIp = (request: HttpServerRequest.HttpServerRequest): string =>
  firstAddress(request, "cf-connecting-ip") ??
    firstAddress(request, "x-forwarded-for") ??
    Option.getOrElse(request.remoteAddress, () => UNKNOWN_CLIENT_IP)

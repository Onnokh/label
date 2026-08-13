import { Effect } from "effect"

import type { ApiKeyRateLimiterShape } from "../modules/rate-limit/ApiKeyRateLimiter.js"
import { webClientIp } from "../modules/rate-limit/ClientIp.js"
import type { PublicProfileRateLimiterShape } from "../modules/rate-limit/PublicProfileRateLimiter.js"
import type { RateLimitResult } from "../modules/rate-limit/RateLimiter.js"

const API_KEY_LENGTH = 64

// Every route of the unauthenticated Public Profile group lives under this
// prefix, so one path test picks out the group that takes the per-IP budget.
export const PUBLIC_API_PREFIX = "/v1/public/"

// ADR 0016: public responses cache for five minutes, which together with the
// one-hour rule makes a save visible 60 to 65 minutes after capture. Only a
// success is cached — a not-found answer must not keep a profile hidden after
// its owner turns Profile Visibility on.
const PUBLIC_CACHE_CONTROL = "public, max-age=300"

type SessionApi = {
  readonly getSession: (input: { readonly headers: Headers }) => Promise<{
    readonly session?: { readonly token?: string } | null
    readonly user?: { readonly id?: string } | null
  } | null>
}

type ApiKeyApi = {
  readonly verifyApiKey: (input: { readonly body: { readonly key: string } }) => Promise<{
    readonly valid: boolean
    readonly error: unknown
    readonly key: { readonly id?: string } | null
  }>
}

export type RequestAuth = {
  readonly api: SessionApi & ApiKeyApi
}

export const exposedApiResponseHeaders = [
  "set-auth-token",
  "ratelimit-limit",
  "ratelimit-remaining",
  "ratelimit-reset",
  "retry-after",
] as const

const extractBearer = (request: Request) =>
  request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]

const isSignedSessionToken = (bearer: string) => bearer.includes(".")

const rateLimitHeaders = (result: RateLimitResult) =>
  new Headers({
    "ratelimit-limit": String(result.limit),
    "ratelimit-remaining": String(result.remaining),
    "ratelimit-reset": String(result.resetSeconds),
    ...(result.allowed ? {} : { "retry-after": String(result.resetSeconds) }),
  })

const rateLimitResponse = (result: RateLimitResult, message: string) =>
  new Response(
    JSON.stringify({
      _tag: "RateLimitExceeded",
      message,
    }),
    {
      status: 429,
      statusText: "Too Many Requests",
      headers: new Headers({
        "content-type": "application/json",
        ...Object.fromEntries(rateLimitHeaders(result)),
      }),
    },
  )

const withHeaders = (response: Response, extra: Headers) => {
  const headers = new Headers(response.headers)
  extra.forEach((value, key) => headers.set(key, value))

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

// The public group carries no API Key, so it is bucketed on the client address
// instead. The budget is applied here rather than inside the route handler so
// the 429 can carry Retry-After, the way the API Key Rate Limit response does.
export const withPublicRateLimit = async (
  request: Request,
  rateLimiter: PublicProfileRateLimiterShape,
  handle: (request: Request) => Promise<Response>,
) => {
  const limit = await Effect.runPromise(rateLimiter.check(webClientIp(request)))
  if (!limit.allowed) {
    return rateLimitResponse(limit, "Public profile rate limit exceeded.")
  }

  const response = await handle(request)
  const headers = rateLimitHeaders(limit)
  if (response.status === 200) {
    headers.set("cache-control", PUBLIC_CACHE_CONTROL)
  }

  return withHeaders(response, headers)
}

export const withApiKeyRateLimit = async (
  request: Request,
  auth: RequestAuth,
  rateLimiter: ApiKeyRateLimiterShape,
  handle: (request: Request) => Promise<Response>,
) => {
  const bearer = extractBearer(request)
  if (!bearer) {
    return handle(request)
  }

  if (isSignedSessionToken(bearer)) {
    return handle(request)
  }

  if (bearer.length < API_KEY_LENGTH) {
    return handle(request)
  }

  const verified = await auth.api.verifyApiKey({ body: { key: bearer } })
  const apiKeyId = verified.valid && verified.error === null ? verified.key?.id : undefined
  if (!apiKeyId) {
    return handle(request)
  }

  const limit = await Effect.runPromise(rateLimiter.check(apiKeyId))
  if (!limit.allowed) {
    return rateLimitResponse(limit, "API key rate limit exceeded.")
  }

  return withHeaders(await handle(request), rateLimitHeaders(limit))
}

import { Effect } from "effect"

import type { ApiKeyRateLimiterShape } from "../modules/rate-limit/ApiKeyRateLimiter.js"
import type { BearerRateLimiterShape } from "../modules/rate-limit/BearerRateLimiter.js"
import { webClientIp } from "../modules/rate-limit/ClientIp.js"
import type { PublicProfileRateLimiterShape } from "../modules/rate-limit/PublicProfileRateLimiter.js"
import type { RateLimitResult } from "../modules/rate-limit/RateLimiter.js"

const API_KEY_LENGTH = 64

// Every route of the unauthenticated Public Profile group lives under this
// prefix, so one path test picks out the group that takes the per-IP budget.
export const PUBLIC_API_PREFIX = "/v1/public/"

// ADR 0016: public responses cache for five minutes, so publishing a Folder
// shows up within five minutes and unpublishing one withdraws it as fast. Only
// a success is cached — a not-found answer must not keep a profile hidden after
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

const applyRateLimit = async (
  limit: RateLimitResult,
  message: string,
  request: Request,
  handle: (request: Request) => Promise<Response>,
) => {
  if (!limit.allowed) {
    return rateLimitResponse(limit, message)
  }

  return withHeaders(await handle(request), rateLimitHeaders(limit))
}

// The public group carries no API Key, so it is bucketed on the client address
// instead. The budget is applied here rather than inside the route handler so
// the 429 can carry Retry-After, the way the other budgets do.
//
// It does not go through applyRateLimit, because a public response also carries
// a cache header when it succeeds and no other budget does.
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

// Every bearer-authenticated request is throttled: recognized API keys get
// their own per-key budget (`ApiKeyRateLimiter`); everything else — a session
// cookie-token, an OAuth access token, or any other bearer shape — falls back
// to a generic per-credential budget (`BearerRateLimiter`) keyed by a hash of
// the token, so no identity resolution is needed just to rate limit it. Only
// fully unauthenticated requests (no bearer at all) pass through unthrottled;
// they fail fast on auth downstream instead.
export const withApiKeyRateLimit = async (
  request: Request,
  auth: RequestAuth,
  rateLimiter: ApiKeyRateLimiterShape,
  bearerRateLimiter: BearerRateLimiterShape,
  handle: (request: Request) => Promise<Response>,
) => {
  const bearer = extractBearer(request)
  if (!bearer) {
    return handle(request)
  }

  const isApiKeyShaped = !isSignedSessionToken(bearer) && bearer.length >= API_KEY_LENGTH
  if (isApiKeyShaped) {
    const verified = await auth.api.verifyApiKey({ body: { key: bearer } })
    const apiKeyId = verified.valid && verified.error === null ? verified.key?.id : undefined
    if (apiKeyId) {
      const limit = await Effect.runPromise(rateLimiter.check(apiKeyId))
      return applyRateLimit(limit, "API key rate limit exceeded.", request, handle)
    }
  }

  const limit = await Effect.runPromise(bearerRateLimiter.check(bearer))
  return applyRateLimit(limit, "Rate limit exceeded.", request, handle)
}

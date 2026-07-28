import { Effect } from "effect"

import type { ApiKeyRateLimiterShape, RateLimitResult } from "../modules/rate-limit/ApiKeyRateLimiter.js"
import type { BearerRateLimiterShape } from "../modules/rate-limit/BearerRateLimiter.js"

const API_KEY_LENGTH = 64

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

const applyRateLimit = async (
  limit: RateLimitResult,
  message: string,
  request: Request,
  handle: (request: Request) => Promise<Response>,
) => {
  if (!limit.allowed) {
    return rateLimitResponse(limit, message)
  }

  const response = await handle(request)
  const headers = new Headers(response.headers)
  rateLimitHeaders(limit).forEach((value, key) => headers.set(key, value))

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
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

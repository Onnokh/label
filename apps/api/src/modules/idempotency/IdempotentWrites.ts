import { Effect } from "effect"

import type { IdempotencyStoreShape, RecordedResponse } from "./IdempotencyStore.js"

export const IDEMPOTENCY_KEY_HEADER = "idempotency-key"

/** Set on a response that was replayed rather than re-executed. */
export const IDEMPOTENT_REPLAY_HEADER = "idempotent-replay"

const IDEMPOTENT_METHODS = new Set(["POST", "PUT", "PATCH"])

/**
 * The longest key accepted. Long enough for a UUID or a ULID with room to
 * spare, short enough that a caller cannot use the header as storage.
 */
const MAX_KEY_LENGTH = 255

/**
 * Response headers worth replaying. The rate-limit headers are deliberately
 * absent: a replay costs a fresh request against the caller's budget, so
 * replaying the numbers from the original would report a stale remaining count.
 */
const REPLAYED_HEADERS = ["content-type", "location", "etag"]

const jsonError = (
  status: number,
  tag: string,
  code: string,
  message: string,
  resolution: string,
) =>
  new Response(
    JSON.stringify({ _tag: tag, code, message, resolution }),
    {
      status,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    },
  )

/**
 * The Redis key one Idempotency-Key maps to.
 *
 * The credential is part of the key, so one caller's key can never collide with
 * another's, and a key leaked from one account cannot be used to read back
 * another account's response. The method and path are in it too: the same key
 * sent to a different operation is a different request, and replaying a capture
 * response to a folder create would be worse than not replaying at all.
 */
export const idempotencyRedisKey = (input: {
  readonly credential: string
  readonly method: string
  readonly path: string
  readonly key: string
}) => {
  const credentialDigest = Bun.hash(input.credential).toString(16)
  return `idempotency:${credentialDigest}:${input.method}:${input.path}:${input.key}`
}

const recordableResponse = async (response: Response): Promise<RecordedResponse> => {
  const headers: Record<string, string> = {}
  for (const name of REPLAYED_HEADERS) {
    const value = response.headers.get(name)
    if (value !== null) headers[name] = value
  }

  return {
    status: response.status,
    headers,
    body: await response.clone().text(),
  }
}

const replayResponse = (recorded: RecordedResponse) => {
  const headers = new Headers(recorded.headers)
  headers.set(IDEMPOTENT_REPLAY_HEADER, "true")
  headers.set("cache-control", "no-store")

  return new Response(recorded.body.length > 0 ? recorded.body : null, {
    status: recorded.status,
    headers,
  })
}

const bearerCredential = (request: Request) =>
  request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1] ?? null

/**
 * Makes a write replay-safe when the caller sends an `Idempotency-Key`.
 *
 * An agent retries on a network failure without knowing whether the first
 * attempt reached the API. Without this, that retry can save the same link
 * twice or create a second Folder. With it, the first response is recorded
 * against the key and every later attempt gets that same response back.
 *
 * Only 2xx responses are recorded. A 5xx is a failure the caller should be able
 * to retry, and a 4xx is deterministic enough to re-derive, so both release the
 * key instead of freezing it for a day.
 *
 * A request without the header is passed straight through: idempotency is
 * something a caller opts into, not a header the API invents on its behalf.
 */
export const withIdempotency = async (
  request: Request,
  store: IdempotencyStoreShape,
  handle: (request: Request) => Promise<Response>,
): Promise<Response> => {
  if (!IDEMPOTENT_METHODS.has(request.method)) return handle(request)

  const key = request.headers.get(IDEMPOTENCY_KEY_HEADER)?.trim()
  if (!key) return handle(request)

  if (key.length > MAX_KEY_LENGTH) {
    return jsonError(
      400,
      "InvalidIdempotencyKey",
      "invalid_idempotency_key",
      `The Idempotency-Key header must be at most ${MAX_KEY_LENGTH} characters.`,
      "Send a UUID, a ULID, or another short unique value, and reuse it only when retrying the same request.",
    )
  }

  const credential = bearerCredential(request)
  if (credential === null) {
    // Unauthenticated writes have no caller to scope the key to. Let the request
    // through so it fails on authentication, which is the real problem.
    return handle(request)
  }

  const redisKey = idempotencyRedisKey({
    credential,
    method: request.method,
    path: new URL(request.url).pathname,
    key,
  })

  const claim = await Effect.runPromise(store.claim(redisKey))

  if (claim._tag === "Replay") return replayResponse(claim.response)

  if (claim._tag === "InFlight") {
    return jsonError(
      409,
      "IdempotencyKeyInFlight",
      "idempotency_key_in_flight",
      "A request with this Idempotency-Key is still being processed.",
      "Wait and retry the same request with the same Idempotency-Key; the original response will be replayed once it completes.",
    )
  }

  if (claim._tag === "Unavailable") return handle(request)

  try {
    const response = await handle(request)

    if (response.status >= 200 && response.status < 300) {
      await Effect.runPromise(store.record(redisKey, await recordableResponse(response)))
    } else {
      await Effect.runPromise(store.release(redisKey))
    }

    return response
  } catch (cause) {
    await Effect.runPromise(store.release(redisKey))
    throw cause
  }
}

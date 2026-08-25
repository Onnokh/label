/**
 * The version of the REST API this deployment serves. It matches the `/v1`
 * path prefix and the OpenAPI document's `info.version`.
 */
export const API_VERSION = "1.0.0"

export const API_VERSION_HEADER = "api-version"

/** Where the versioning and deprecation policy is written down. */
export const DEPRECATION_POLICY_URL = "https://sleevy.app/docs/versioning"

export type Deprecation = {
  /** The method and path of the operation being retired, as `POST /v1/thing`. */
  readonly operation: string
  /** When it was announced, as an IMF-fixdate. */
  readonly deprecatedAt: string
  /** When it stops answering, as an IMF-fixdate. At least 6 months later. */
  readonly sunsetAt: string
  /** What a caller should use instead. */
  readonly replacement: string
}

/**
 * Every operation currently on the way out.
 *
 * Deprecating a route means adding it here, which is what makes the promise in
 * the policy enforceable rather than aspirational: the `Deprecation` and
 * `Sunset` headers, the OpenAPI `deprecated` flag, and the docs page all read
 * from this one list, so a route cannot be quietly retired without announcing
 * itself on every response it serves.
 *
 * Empty today. Nothing in v1 is scheduled for removal.
 */
export const DEPRECATIONS: ReadonlyArray<Deprecation> = []

const deprecationFor = (method: string, pathname: string) =>
  DEPRECATIONS.find((entry) => entry.operation === `${method.toUpperCase()} ${pathname}`)

/**
 * States the API version on every response, and announces a retirement on the
 * responses of any operation that has one.
 *
 * `Deprecation` and `Sunset` are RFC 8594 / RFC 9745 headers: an agent reading
 * them learns that a route it depends on has an end date without having to
 * re-read the documentation, and the `Link` points at what to do about it.
 */
export const withVersionHeaders = (request: Request, response: Response): Response => {
  const headers = new Headers(response.headers)
  headers.set(API_VERSION_HEADER, API_VERSION)

  const pathname = new URL(request.url).pathname
  const deprecation = deprecationFor(request.method, pathname)

  if (deprecation) {
    headers.set("deprecation", `@${Math.floor(new Date(deprecation.deprecatedAt).getTime() / 1000)}`)
    headers.set("sunset", deprecation.sunsetAt)
    headers.append("link", `<${DEPRECATION_POLICY_URL}>; rel="deprecation"; type="text/html"`)
    headers.append("link", `<${deprecation.replacement}>; rel="successor-version"`)
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

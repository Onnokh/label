const HTML = "text/html"
const MARKDOWN = "text/markdown"
const JSON_TYPE = "application/json"

type Representation = typeof HTML | typeof MARKDOWN | typeof JSON_TYPE

type AcceptRange = {
  readonly type: string
  readonly subtype: string
  readonly quality: number
  readonly index: number
}

const parseAccept = (header: string): ReadonlyArray<AcceptRange> =>
  header.split(",").flatMap((raw, index) => {
    const [mediaRange, ...rawParameters] = raw.trim().split(";")
    const [type, subtype, ...extra] = mediaRange.trim().toLowerCase().split("/")
    if (!type || !subtype || extra.length > 0) return []

    let quality = 1
    for (const rawParameter of rawParameters) {
      const [name, value] = rawParameter.trim().split("=")
      if (name?.toLowerCase() !== "q") continue
      const parsed = Number(value)
      quality = Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : 0
      break
    }

    return [{ type, subtype, quality, index }]
  })

const matchSpecificity = (range: AcceptRange, representation: Representation) => {
  const [type, subtype] = representation.split("/")
  if (range.type === type && range.subtype === subtype) return 2
  if (range.type === type && range.subtype === "*") return 1
  if (range.type === "*" && range.subtype === "*") return 0
  return -1
}

const scoreRepresentation = (
  ranges: ReadonlyArray<AcceptRange>,
  representation: Representation,
) => {
  let specificity = -1
  let quality = 0
  let index = Number.POSITIVE_INFINITY

  for (const range of ranges) {
    const candidateSpecificity = matchSpecificity(range, representation)
    if (candidateSpecificity < 0) continue
    if (candidateSpecificity < specificity) continue
    if (
      candidateSpecificity > specificity ||
      range.quality > quality ||
      (range.quality === quality && range.index < index)
    ) {
      specificity = candidateSpecificity
      quality = range.quality
      index = range.index
    }
  }

  return { specificity, quality, index }
}

/** RFC 9110-style proactive negotiation for the small set of representations we emit. */
export const negotiateRepresentation = (
  accept: string | null,
  available: ReadonlyArray<Representation>,
  defaultRepresentation: Representation,
): Representation | null => {
  if (accept === null) return defaultRepresentation
  const ranges = parseAccept(accept)
  if (ranges.length === 0) return null

  let selected: Representation | null = null
  let selectedScore = { quality: 0, specificity: -1, index: Number.POSITIVE_INFINITY }

  for (const representation of available) {
    const score = scoreRepresentation(ranges, representation)
    if (score.quality === 0) continue

    const isBetter =
      selected === null ||
      score.quality > selectedScore.quality ||
      (score.quality === selectedScore.quality && score.specificity > selectedScore.specificity) ||
      (score.quality === selectedScore.quality &&
        score.specificity === selectedScore.specificity &&
        score.index < selectedScore.index) ||
      (score.quality === selectedScore.quality &&
        score.specificity === selectedScore.specificity &&
        score.index === selectedScore.index &&
        representation === defaultRepresentation)

    if (isBetter) {
      selected = representation
      selectedScore = score
    }
  }

  return selected
}

export const appendVary = (headers: Headers, value: string) => {
  const values = (headers.get("Vary") ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
  if (!values.some((entry) => entry.toLowerCase() === value.toLowerCase())) {
    values.push(value)
  }
  if (values.length > 0) headers.set("Vary", values.join(", "))
}

export const markdownVariantPath = (pathname: string): string | null => {
  const path = pathname.length > 1 && pathname.endsWith("/")
    ? pathname.slice(0, -1)
    : pathname

  if (path === "/") return "/index.md"
  if (path === "/docs") return "/docs/index.md"
  if (path.startsWith("/docs/") && !path.endsWith(".md")) return `${path}.md`
  return null
}

const responseWithHeaders = (response: Response, headers: Headers, body = response.body) =>
  new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })

const jsonError = (
  status: number,
  tag: string,
  code: string,
  message: string,
  resolution: string,
  extra: Record<string, unknown> = {},
) => Response.json({ _tag: tag, code, message, resolution, ...extra }, { status })

const notAcceptable = () => {
  const response = jsonError(
    406,
    "NotAcceptable",
    "not_acceptable",
    "The requested representation is not available.",
    "Request text/html or text/markdown for this page.",
    { acceptable: [HTML, MARKDOWN] },
  )
  appendVary(response.headers, "Accept")
  return response
}

const notFoundMarkdown = (pathname: string) => `# 404 — Page not found

No page exists at \`${pathname}\`.

- [Sitemap](https://sleevy.app/sitemap.xml)
- [Agent index](https://sleevy.app/llms.txt)
- [API and MCP documentation](https://sleevy.app/docs)
`

const notFoundResponse = (request: Request, htmlResponse: Response) => {
  const pathname = new URL(request.url).pathname
  const representation = negotiateRepresentation(
    request.headers.get("Accept"),
    [HTML, MARKDOWN, JSON_TYPE],
    HTML,
  )

  if (representation === null) return notAcceptable()

  if (representation === HTML) {
    const headers = new Headers(htmlResponse.headers)
    appendVary(headers, "Accept")
    return responseWithHeaders(htmlResponse, headers)
  }

  if (representation === MARKDOWN) {
    const headers = new Headers({
      "Cache-Control": "no-store",
      "Content-Type": "text/markdown; charset=utf-8",
      "X-Robots-Tag": "noindex, nofollow",
    })
    appendVary(headers, "Accept")
    return new Response(request.method === "HEAD" ? null : notFoundMarkdown(pathname), {
      status: 404,
      headers,
    })
  }

  const response = jsonError(
    404,
    "RouteNotFound",
    "route_not_found",
    `No page exists at ${pathname}.`,
    "Check https://sleevy.app/sitemap.xml, https://sleevy.app/llms.txt, or https://sleevy.app/docs.",
  )
  appendVary(response.headers, "Accept")
  response.headers.set("Cache-Control", "no-store")
  response.headers.set("X-Robots-Tag", "noindex, nofollow")
  return request.method === "HEAD"
    ? new Response(null, { status: response.status, headers: response.headers })
    : response
}

const asGetRequest = (request: Request, url: URL) =>
  new Request(url, {
    method: "GET",
    headers: request.headers,
  })

const withHtmlAccept = (request: Request) => {
  const headers = new Headers(request.headers)
  headers.set("Accept", HTML)
  return new Request(request, { headers })
}

export type WebRouteHandler = (request: Request) => Promise<Response>

/** Adds same-URL Markdown negotiation and recoverable 404 representations. */
export const withAgentReadyRouting = async (
  request: Request,
  handle: WebRouteHandler,
): Promise<Response> => {
  const url = new URL(request.url)
  const markdownPath = markdownVariantPath(url.pathname)

  if (markdownPath !== null && (request.method === "GET" || request.method === "HEAD")) {
    const representation = negotiateRepresentation(
      request.headers.get("Accept"),
      [HTML, MARKDOWN],
      HTML,
    )
    if (representation === null) return notAcceptable()

    if (representation === MARKDOWN) {
      const markdownUrl = new URL(url)
      markdownUrl.pathname = markdownPath
      const response = await handle(asGetRequest(request, markdownUrl))
      if (response.status === 404) return notFoundResponse(request, response)

      const headers = new Headers(response.headers)
      headers.set("Content-Type", "text/markdown; charset=utf-8")
      appendVary(headers, "Accept")
      return responseWithHeaders(response, headers, request.method === "HEAD" ? null : response.body)
    }
  }

  const acceptsHtml = negotiateRepresentation(
    request.headers.get("Accept"),
    [HTML],
    HTML,
  ) !== null
  const routeRequest =
    !acceptsHtml && (request.method === "GET" || request.method === "HEAD")
      ? withHtmlAccept(request)
      : request
  const response = await handle(routeRequest)
  if (response.status === 404) return notFoundResponse(request, response)

  if (!acceptsHtml && (response.headers.get("Content-Type") ?? "").includes(HTML)) {
    return notAcceptable()
  }

  if (markdownPath !== null) {
    const headers = new Headers(response.headers)
    appendVary(headers, "Accept")
    return responseWithHeaders(response, headers)
  }

  return response
}

export const oauthDiscoveryRedirect = (
  pathname: string,
  apiBaseUrl: string,
): Response | null => {
  const baseUrl = apiBaseUrl.replace(/\/$/, "")
  if (pathname === "/.well-known/oauth-authorization-server") {
    return new Response(null, {
      status: 308,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=300",
        Location: `${baseUrl}/.well-known/oauth-authorization-server/api/auth`,
      },
    })
  }
  if (pathname === "/.well-known/oauth-protected-resource") {
    return new Response(null, {
      status: 308,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=300",
        Location: `${baseUrl}/.well-known/oauth-protected-resource`,
      },
    })
  }
  return null
}

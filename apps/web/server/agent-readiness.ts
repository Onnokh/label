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

/**
 * Paths that are the same document under another name.
 *
 * `/docs/{$}.md` covers every page below `/docs/`, but not `/docs` itself, so
 * an agent appending `.md` to the documentation root used to get a 404.
 */
const markdownAliases: Record<string, string> = {
  "/docs.md": "/docs/index.md",
}

export const markdownAliasPath = (pathname: string): string | null =>
  markdownAliases[pathname] ?? null

export const markdownVariantPath = (pathname: string): string | null => {
  const path = pathname.length > 1 && pathname.endsWith("/")
    ? pathname.slice(0, -1)
    : pathname

  if (path === "/") return "/index.md"
  if (path === "/docs") return "/docs/index.md"
  // Only extensionless documentation pages have a Markdown twin. A path that
  // already names a file — /docs/llms.txt, /docs/whatever.json — is the
  // document itself, and asking for `<that>.md` would 404.
  if (path.startsWith("/docs/") && !/\.[a-z0-9]+$/i.test(path)) return `${path}.md`
  return null
}

/**
 * The RFC 8288 links every page advertises about itself and about the site.
 *
 * An agent that reads response headers learns where the sitemap, the agent
 * index, the OpenAPI document, and the API catalog are without parsing HTML —
 * and, for a page that has one, where its Markdown twin lives.
 */
export const linkHeaderValue = (pathname: string, origin = "https://sleevy.app") => {
  const links = [
    `<${origin}/sitemap.xml>; rel="sitemap"; type="application/xml"`,
    `<${origin}/llms.txt>; rel="describedby"; type="text/markdown"`,
    `<${origin}/openapi.json>; rel="service-desc"; type="application/vnd.oai.openapi+json"`,
    `<${origin}/docs>; rel="service-doc"; type="text/html"`,
    `<${origin}/.well-known/api-catalog>; rel="api-catalog"`,
  ]

  const markdownPath = markdownVariantPath(pathname)
  if (markdownPath !== null) {
    // The advertised twin is the URL an agent can actually fetch: /docs/x.md
    // for /docs/x, and /index.md for the home page.
    links.unshift(`<${origin}${markdownPath}>; rel="alternate"; type="text/markdown"`)
  }

  return links.join(", ")
}

/** Adds the site's Link header to a response, keeping any the route already set. */
export const withLinkHeader = (pathname: string, response: Response): Response => {
  const contentType = response.headers.get("Content-Type") ?? ""
  if (!contentType.includes(HTML) && !contentType.includes(MARKDOWN)) return response

  const headers = new Headers(response.headers)
  headers.append("Link", linkHeaderValue(pathname))

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

/**
 * The machine-readable view of the home page, for `?mode=agent`.
 *
 * A marketing page answers "should I use this"; this answers "how do I call
 * it". Everything here is a pointer to a document that is itself
 * machine-readable, so an agent needs one request to orient and one more to
 * get whatever it actually needs.
 */
export const agentModeDocument = (origin = "https://sleevy.app") => ({
  name: "Sleevy",
  description:
    "A native-first read-later service. Save any URL to a personal reading queue, then find, organize, and mark off what is in it.",
  homepage: `${origin}/`,
  documentation: `${origin}/docs`,
  apiBaseUrl: "https://api.sleevy.app",
  contact: "support@sleevy.app",
  authentication: {
    type: "oauth2",
    alternative: "bearer-api-key",
    selfService: true,
    guide: `${origin}/auth.md`,
    apiKeys: `${origin}/settings`,
    protectedResourceMetadata:
      "https://api.sleevy.app/.well-known/oauth-protected-resource",
    authorizationServerMetadata:
      "https://api.sleevy.app/.well-known/oauth-authorization-server/api/auth",
  },
  surfaces: {
    mcp: "https://api.sleevy.app/mcp",
    rest: "https://api.sleevy.app",
  },
  discovery: {
    llmsTxt: `${origin}/llms.txt`,
    docsLlmsTxt: `${origin}/docs/llms.txt`,
    agentInstructions: `${origin}/agent-instructions.md`,
    openapi: `${origin}/openapi.json`,
    mcpServerCard: `${origin}/.well-known/mcp/server-card.json`,
    agentCard: `${origin}/.well-known/agent-card.json`,
    agentSkills: `${origin}/.well-known/agent-skills/index.json`,
    aiCatalog: `${origin}/.well-known/ai-catalog.json`,
    apiCatalog: `${origin}/.well-known/api-catalog`,
    integrations: `${origin}/.well-known/integrations.json`,
    sitemap: `${origin}/sitemap.xml`,
  },
  capabilities: [
    "Save an HTTP or HTTPS URL to a personal read-later queue.",
    "Save up to 50 URLs in one batch request, each reporting its own outcome.",
    "List and page through Saved Items with an opaque cursor.",
    "Mark Saved Items read or unread, and record opens.",
    "Create, update, publish, and delete Folders, and move Saved Items between them.",
  ],
  conventions: {
    idempotency: {
      header: "Idempotency-Key",
      methods: ["POST", "PUT", "PATCH"],
      retentionSeconds: 86_400,
      replayHeader: "Idempotent-Replay",
    },
    pagination: { style: "cursor", limitParameter: "limit", cursorParameter: "cursor", maxLimit: 100 },
    rateLimit: { headers: ["RateLimit-Limit", "RateLimit-Remaining", "RateLimit-Reset", "Retry-After"] },
    versioning: { style: "url-path", versionHeader: "API-Version", deprecationHeaders: ["Deprecation", "Sunset"] },
    errors: { shape: ["code", "message", "resolution"] },
  },
  notFor: [
    "Crawling or archiving the content of a page.",
    "Acting as a general notes database.",
    "Answering questions about pages that have not been saved.",
  ],
})

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

export const discoveryRedirect = (
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
  // `/.well-known/mcp/server-card.json` is NOT redirected. It is served as a
  // real document from public/, generated from the same tool catalogue the API
  // builds its card from (`bun run generate:discovery`). A client reading a
  // well-known path should get the card, not a 308 to another origin it may
  // decline to follow. The older extensionless alias still redirects, since
  // nothing generates a file for it.
  if (pathname === "/.well-known/mcp-server-card") {
    return new Response(null, {
      status: 308,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=300",
        Location: `${baseUrl}/mcp/server-card`,
      },
    })
  }
  return null
}

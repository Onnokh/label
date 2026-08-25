import handler from "./dist/server/server.js"
import {
  agentModeDocument,
  discoveryRedirect,
  markdownAliasPath,
  markdownVariantPath,
  withAgentReadyRouting,
  withLinkHeader,
} from "./server/agent-readiness"

const port = Number(process.env.PORT ?? 3000)
const staticRoots = [`${import.meta.dir}/dist/client`, `${import.meta.dir}/dist`]
const indexNowKey = process.env.INDEXNOW_KEY
const apiBaseUrl = process.env.API_BASE_URL ?? "https://api.sleevy.app"
const hasValidIndexNowKey = /^[A-Za-z0-9-]{8,128}$/.test(indexNowKey ?? "")
const contentTypes: Record<string, string> = {
  avif: "image/avif",
  css: "text/css; charset=utf-8",
  ico: "image/x-icon",
  jfif: "image/jpeg",
  js: "text/javascript; charset=utf-8",
  json: "application/json; charset=utf-8",
  md: "text/markdown; charset=utf-8",
  png: "image/png",
  svg: "image/svg+xml",
  webp: "image/webp",
}

const longLivedStaticExtensions = new Set(["avif", "gif", "ico", "jfif", "jpg", "jpeg", "png", "svg", "webp"])

// Extensionless discovery files whose Content-Type can't be derived from a file extension.
const contentTypeByPathname: Record<string, string> = {
  "/.well-known/api-catalog": "application/linkset+json; charset=utf-8",
  "/.well-known/ai-catalog.json": "application/ai-catalog+json; charset=utf-8",
  "/.well-known/mcp/server-card.json": "application/mcp-server-card+json; charset=utf-8",
}

// Marketing pages are fully server-rendered: every visible element (including
// the hero's entrance animation, which is CSS) works without JavaScript, and
// hydration only adds progressive extras (scroll-linked hero expand, session
// state in the nav, the mobile menu). Loading the ~500 KB module graph up front
// makes that JS compete with the render-critical HTML/CSS on slow connections
// and delays first paint for nothing the visitor can see yet. So for these
// routes the module scripts are swapped for a tiny loader that starts them on
// the first sign of life (scroll/pointer/key/focus) instead. Any interaction —
// including the tap that would need hydrated JS — triggers loading first.

// The AI crawlers and agent fetchers that get Markdown instead of the marketing
// HTML. They are here to read, not to render, so the document without the
// layout is both smaller and easier for them to use.
const markdownBotPattern =
  /(GPTBot|OAI-SearchBot|ChatGPT-User|ClaudeBot|Claude-User|Claude-SearchBot|PerplexityBot|Perplexity-User|Google-Extended|Applebot-Extended|DeepSeekBot|ora-agent)/i

const wantsMarkdownByUserAgent = (req: Request) =>
  markdownBotPattern.test(req.headers.get("user-agent") ?? "")

const deferredHydrationPaths = new Set(["/", "/support", "/privacy"])

// Docs pages are content-first too; their slugs come from content/docs and the
// OpenAPI schema, so match by prefix instead of enumerating them.
const isDeferredHydrationPath = (pathname: string) =>
  deferredHydrationPaths.has(pathname) || pathname === "/docs" || (pathname.startsWith("/docs/") && !pathname.endsWith(".md"))

const hydrationLoader = (sources: string[]) =>
  `<script>(function(){var e=["pointerdown","pointermove","keydown","touchstart","scroll","focusin"],l=function(){e.forEach(function(n){removeEventListener(n,l,!0)});${JSON.stringify(sources)}.forEach(function(s){var t=document.createElement("script");t.type="module";t.async=!0;t.src=s;document.head.appendChild(t)})};e.forEach(function(n){addEventListener(n,l,{passive:!0,capture:!0})})})()</script>`

async function withDeferredHydration(req: Request, response: Response): Promise<Response> {
  const url = new URL(req.url)

  if (req.method !== "GET" || !isDeferredHydrationPath(url.pathname)) return response
  if (response.status !== 200 || !(response.headers.get("content-type") ?? "").includes("text/html")) return response

  const html = await response.text()
  const sources: string[] = []
  const transformed = html
    .replace(/<link rel="modulepreload"[^>]*\/>/g, "")
    .replace(/<script type="module" async(?:="")? src="([^"]+)"><\/script>/g, (_, src: string) => {
      sources.push(src)
      return ""
    })

  // No module script matched — the framework's output shape changed; serve the
  // page untouched rather than risk shipping one that never hydrates.
  const body = sources.length > 0 ? transformed.replace("</body>", `${hydrationLoader(sources)}</body>`) : html

  const headers = new Headers(response.headers)
  headers.delete("Content-Length")

  return new Response(body, { status: response.status, statusText: response.statusText, headers })
}

// The app shell asks to stay out of the index with a robots meta tag, but its
// routes are ssr: false, so that tag reaches a crawler only after hydration —
// the served HTML carries no robots signal at all. /inbox needs one it can
// actually read: it is already indexed from an earlier crawl, and robots.txt
// keeps it crawlable on purpose so the noindex can arrive and drop it. A header
// survives whether or not the route renders on the server, so send it here.
const noindexPaths = new Set(["/connect", "/inbox", "/library", "/settings"])

const isNoindexPath = (pathname: string) => {
  const path = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname

  return noindexPaths.has(path) || path.startsWith("/library/") || path.startsWith("/oauth/")
}

function withRobotsTag(url: URL, response: Response): Response {
  if (!isNoindexPath(url.pathname)) return response

  const headers = new Headers(response.headers)
  headers.set("X-Robots-Tag", "noindex, nofollow")

  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}

// Text assets (HTML, JS, CSS, JSON, SVG) ship uncompressed otherwise — the SSR
// bundle alone is ~500 KB on the wire, which dominates load on slow links. Gzip
// them on the fly; images are already compressed formats, so leave them be.
const compressibleType = /^(?:text\/|application\/(?:javascript|json|xml)|image\/svg\+xml)/

function withCompression(req: Request, response: Response): Response {
  if (!(req.headers.get("accept-encoding") ?? "").includes("gzip")) return response
  if (response.headers.get("content-encoding")) return response
  if (!response.body) return response
  if (!compressibleType.test(response.headers.get("content-type") ?? "")) return response

  const headers = new Headers(response.headers)
  headers.set("Content-Encoding", "gzip")
  headers.delete("Content-Length") // unknown until the stream is fully compressed
  headers.append("Vary", "Accept-Encoding")

  return new Response(response.body.pipeThrough(new CompressionStream("gzip")), {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

// A path whose representation depends on who asked must say so, or a shared
// cache will hand a browser the Markdown a crawler asked for.
function withVary(response: Response): Response {
  const headers = new Headers(response.headers)
  headers.append("Vary", "User-Agent")

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

async function serveStatic(url: URL) {
  const pathname = decodeURIComponent(url.pathname)

  if (pathname.includes("..")) {
    return undefined
  }

  if (pathname === "/favicon.ico") {
    const file = Bun.file(`${import.meta.dir}/favicon.ico`)

    if (await file.exists()) {
      return new Response(file, {
        headers: {
          "Cache-Control": "public, max-age=86400",
          "Content-Type": contentTypes.ico,
        },
      })
    }
  }

  const files = staticRoots.map((root) => Bun.file(`${root}${pathname}`))
  const exists = await Promise.all(files.map((f) => f.exists()))
  const index = exists.indexOf(true)

  if (index !== -1) {
    const file = files[index]
    const extension = pathname.split(".").pop() ?? ""
    const isLongLivedStaticAsset = pathname.startsWith("/assets/") || longLivedStaticExtensions.has(extension)

    return new Response(file, {
      headers: {
        "Cache-Control": isLongLivedStaticAsset
          ? "public, max-age=31536000, immutable"
          : "public, max-age=3600",
        "Content-Type": contentTypeByPathname[pathname] ?? contentTypes[extension] ?? file.type,
        // Discovery documents are read cross-origin by agents and browser-based
        // MCP clients, so they are readable from anywhere. They describe public
        // surfaces and carry nothing account-specific.
        ...(pathname.startsWith("/.well-known/")
          ? { "Access-Control-Allow-Origin": "*" }
          : {}),
      },
    })
  }

  return undefined
}

Bun.serve({
  port,
  async fetch(req) {
    const url = new URL(req.url)

    if (url.pathname === "/health") {
      return Response.json({ ok: true })
    }

    const discoveryResponse = discoveryRedirect(url.pathname, apiBaseUrl)
    if (discoveryResponse) return discoveryResponse

    // The structured view of the home page. A marketing page answers "should I
    // use this"; this answers "how do I call it".
    if (url.pathname === "/" && url.searchParams.get("mode") === "agent") {
      return Response.json(agentModeDocument(), {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "public, max-age=3600",
          Link: '<https://sleevy.app/>; rel="canonical", <https://sleevy.app/index.md>; rel="alternate"; type="text/markdown"',
          Vary: "Accept, User-Agent",
        },
      })
    }

    // IndexNow verifies site ownership by fetching a public text file whose
    // filename and contents both equal the configured key. Keep the key in
    // deployment configuration so it can be rotated without a rebuild.
    if (hasValidIndexNowKey && url.pathname === `/${indexNowKey}.txt`) {
      return new Response(indexNowKey, {
        headers: {
          "Cache-Control": "public, max-age=3600",
          "Content-Type": "text/plain; charset=utf-8",
        },
      })
    }

    // `/docs.md` is the documentation index under another name, and an AI
    // crawler asking for an HTML page gets the Markdown twin of it instead.
    // Both are served by rewriting the path, so one document has one
    // implementation rather than two that can drift.
    const aliasPath = markdownAliasPath(url.pathname)
    const botMarkdownPath = aliasPath === null && wantsMarkdownByUserAgent(req)
      ? markdownVariantPath(url.pathname)
      : null
    const rewrittenPath = aliasPath ?? botMarkdownPath

    const routedRequest = rewrittenPath === null
      ? req
      : new Request(new URL(rewrittenPath, url), { method: "GET", headers: req.headers })

    const response = await withAgentReadyRouting(routedRequest, async (routeRequest) => {
      const routeUrl = new URL(routeRequest.url)
      const staticResponse = await serveStatic(routeUrl)
      if (staticResponse) return staticResponse

      return withRobotsTag(
        routeUrl,
        await withDeferredHydration(routeRequest, await handler.fetch(routeRequest)),
      )
    })

    const withLinks = withLinkHeader(url.pathname, response)
    const varied = rewrittenPath === null ? withLinks : withVary(withLinks)

    return withCompression(req, varied)
  },
})

console.log(`web listening on :${port}`)

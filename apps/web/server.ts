import handler from "./dist/server/server.js"

const port = Number(process.env.PORT ?? 3000)
const staticRoots = [`${import.meta.dir}/dist/client`, `${import.meta.dir}/dist`]
const contentTypes: Record<string, string> = {
  avif: "image/avif",
  css: "text/css; charset=utf-8",
  ico: "image/x-icon",
  jfif: "image/jpeg",
  js: "text/javascript; charset=utf-8",
  json: "application/json; charset=utf-8",
  png: "image/png",
  svg: "image/svg+xml",
  webp: "image/webp",
}

const longLivedStaticExtensions = new Set(["avif", "gif", "ico", "jfif", "jpg", "jpeg", "png", "svg", "webp"])

// Marketing pages are fully server-rendered: every visible element (including
// the hero's entrance animation, which is CSS) works without JavaScript, and
// hydration only adds progressive extras (scroll-linked hero expand, session
// state in the nav, the mobile menu). Loading the ~500 KB module graph up front
// makes that JS compete with the render-critical HTML/CSS on slow connections
// and delays first paint for nothing the visitor can see yet. So for these
// routes the module scripts are swapped for a tiny loader that starts them on
// the first sign of life (scroll/pointer/key/focus) instead. Any interaction —
// including the tap that would need hydrated JS — triggers loading first.
const deferredHydrationPaths = new Set(["/", "/docs", "/support", "/privacy"])

const hydrationLoader = (sources: string[]) =>
  `<script>(function(){var e=["pointerdown","pointermove","keydown","touchstart","scroll","focusin"],l=function(){e.forEach(function(n){removeEventListener(n,l,!0)});${JSON.stringify(sources)}.forEach(function(s){var t=document.createElement("script");t.type="module";t.async=!0;t.src=s;document.head.appendChild(t)})};e.forEach(function(n){addEventListener(n,l,{passive:!0,capture:!0})})})()</script>`

async function withDeferredHydration(req: Request, response: Response): Promise<Response> {
  const url = new URL(req.url)

  if (req.method !== "GET" || !deferredHydrationPaths.has(url.pathname)) return response
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
        "Content-Type": contentTypes[extension] ?? file.type,
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

    const staticResponse = await serveStatic(url)

    if (staticResponse) {
      return withCompression(req, staticResponse)
    }

    return withCompression(req, await withDeferredHydration(req, await handler.fetch(req)))
  },
})

console.log(`web listening on :${port}`)

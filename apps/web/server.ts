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

    return withCompression(req, await handler.fetch(req))
  },
})

console.log(`web listening on :${port}`)

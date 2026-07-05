import handler from "./dist/server/server.js"

const port = Number(process.env.PORT ?? 3000)
const staticRoots = [`${import.meta.dir}/dist/client`, `${import.meta.dir}/dist`]
const contentTypes: Record<string, string> = {
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

// Extensionless discovery files whose Content-Type can't be derived from a file extension.
const contentTypeByPathname: Record<string, string> = {
  "/.well-known/api-catalog": "application/linkset+json; charset=utf-8",
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
      return staticResponse
    }

    return handler.fetch(req)
  },
})

console.log(`web listening on :${port}`)

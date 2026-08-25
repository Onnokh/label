import { describe, expect, test } from "bun:test"

import {
  markdownVariantPath,
  negotiateRepresentation,
  oauthDiscoveryRedirect,
  withAgentReadyRouting,
} from "../../server/agent-readiness"

describe("agent-ready web routing", () => {
  test("negotiates q-values, specificity, wildcards, and explicit exclusions", () => {
    const available = ["text/html", "text/markdown"] as const

    expect(negotiateRepresentation(null, available, "text/html")).toBe("text/html")
    expect(negotiateRepresentation("*/*", available, "text/html")).toBe("text/html")
    expect(negotiateRepresentation("text/markdown", available, "text/html")).toBe("text/markdown")
    expect(
      negotiateRepresentation(
        "text/markdown, text/html;q=0.8",
        available,
        "text/html",
      ),
    ).toBe("text/markdown")
    expect(negotiateRepresentation("text/html", available, "text/html")).toBe("text/html")
    expect(
      negotiateRepresentation(
        "text/markdown;q=0, text/html",
        available,
        "text/html",
      ),
    ).toBe("text/html")
    expect(negotiateRepresentation("text/markdown;q=0", available, "text/html")).toBeNull()
    expect(
      negotiateRepresentation(
        "text/*;q=0.8, text/html;q=0",
        available,
        "text/html",
      ),
    ).toBe("text/markdown")
  })

  test("maps the homepage and extensionless docs routes to Markdown variants", () => {
    expect(markdownVariantPath("/")).toBe("/index.md")
    expect(markdownVariantPath("/docs")).toBe("/docs/index.md")
    expect(markdownVariantPath("/docs/getting-started")).toBe(
      "/docs/getting-started.md",
    )
    expect(markdownVariantPath("/docs/getting-started.md")).toBeNull()
    expect(markdownVariantPath("/ios-app")).toBeNull()
  })

  test("serves Markdown from the same homepage URL and varies caches on Accept", async () => {
    let handledPath = ""
    const response = await withAgentReadyRouting(
      new Request("https://sleevy.app/", {
        headers: { Accept: "text/markdown, text/html;q=0.8" },
      }),
      async (request) => {
        handledPath = new URL(request.url).pathname
        return new Response("# Sleevy", {
          headers: { "Content-Type": "text/plain" },
        })
      },
    )

    expect(handledPath).toBe("/index.md")
    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toBe("text/markdown; charset=utf-8")
    expect(response.headers.get("vary")).toBe("Accept")
    expect(await response.text()).toBe("# Sleevy")
  })

  test("keeps HTML as the default representation and marks it Vary: Accept", async () => {
    const response = await withAgentReadyRouting(
      new Request("https://sleevy.app/"),
      async () => new Response("<h1>Sleevy</h1>", {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      }),
    )

    expect(response.headers.get("content-type")).toContain("text/html")
    expect(response.headers.get("vary")).toBe("Accept")
    expect(await response.text()).toBe("<h1>Sleevy</h1>")
  })

  test("returns a short recoverable Markdown 404 to agents", async () => {
    const response = await withAgentReadyRouting(
      new Request("https://sleevy.app/missing", {
        headers: { Accept: "text/markdown" },
      }),
      async (request) =>
        request.headers.get("Accept") === "text/html"
          ? new Response("<h1>Not found</h1>", {
              status: 404,
              headers: { "Content-Type": "text/html; charset=utf-8" },
            })
          : Response.json({ error: "Only HTML requests are supported here" }, {
              status: 500,
            }),
    )

    expect(response.status).toBe(404)
    expect(response.headers.get("content-type")).toBe("text/markdown; charset=utf-8")
    expect(response.headers.get("vary")).toBe("Accept")
    const body = await response.text()
    expect(body).toContain("# 404 — Page not found")
    expect(body).toContain("https://sleevy.app/sitemap.xml")
    expect(body).toContain("https://sleevy.app/llms.txt")
    expect(body).toContain("https://sleevy.app/docs")
  })

  test("returns structured JSON for a missing page when JSON is requested", async () => {
    const response = await withAgentReadyRouting(
      new Request("https://sleevy.app/missing", {
        headers: { Accept: "application/json" },
      }),
      async () => new Response(null, { status: 404 }),
    )

    expect(response.status).toBe(404)
    expect(response.headers.get("content-type")).toContain("application/json")
    expect(await response.json()).toMatchObject({
      _tag: "RouteNotFound",
      code: "route_not_found",
      message: "No page exists at /missing.",
    })
  })

  test("returns 406 when no available representation is acceptable", async () => {
    const response = await withAgentReadyRouting(
      new Request("https://sleevy.app/", {
        headers: { Accept: "image/png" },
      }),
      async () => new Response("should not be used"),
    )

    expect(response.status).toBe(406)
    expect(response.headers.get("vary")).toBe("Accept")
    expect(await response.json()).toMatchObject({
      _tag: "NotAcceptable",
      code: "not_acceptable",
      acceptable: ["text/html", "text/markdown"],
    })
  })

  test("returns 406 instead of a framework 500 for an HTML-only page", async () => {
    const response = await withAgentReadyRouting(
      new Request("https://sleevy.app/ios-app", {
        headers: { Accept: "text/markdown" },
      }),
      async (request) =>
        request.headers.get("Accept") === "text/html"
          ? new Response("<h1>iOS app</h1>", {
              headers: { "Content-Type": "text/html; charset=utf-8" },
            })
          : Response.json({ error: "Only HTML requests are supported here" }, {
              status: 500,
            }),
    )

    expect(response.status).toBe(406)
    expect(await response.json()).toMatchObject({ code: "not_acceptable" })
  })

  test("answers HEAD negotiation without a response body", async () => {
    let handledMethod = ""
    const response = await withAgentReadyRouting(
      new Request("https://sleevy.app/", {
        method: "HEAD",
        headers: { Accept: "text/markdown" },
      }),
      async (request) => {
        handledMethod = request.method
        return new Response("# Sleevy")
      },
    )

    expect(handledMethod).toBe("GET")
    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toBe("text/markdown; charset=utf-8")
    expect(await response.text()).toBe("")
  })

  test("redirects web-origin OAuth discovery to canonical API metadata", () => {
    const authorization = oauthDiscoveryRedirect(
      "/.well-known/oauth-authorization-server",
      "https://api.sleevy.app/",
    )
    const resource = oauthDiscoveryRedirect(
      "/.well-known/oauth-protected-resource",
      "https://api.sleevy.app/",
    )

    expect(authorization?.status).toBe(308)
    expect(authorization?.headers.get("location")).toBe(
      "https://api.sleevy.app/.well-known/oauth-authorization-server/api/auth",
    )
    expect(authorization?.headers.get("access-control-allow-origin")).toBe("*")
    expect(resource?.headers.get("location")).toBe(
      "https://api.sleevy.app/.well-known/oauth-protected-resource",
    )
  })
})

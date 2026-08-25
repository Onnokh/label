import { describe, expect, test } from "bun:test"

import {
  discoveryRedirect,
  markdownVariantPath,
  negotiateRepresentation,
  withAgentReadyRouting,
} from "../../server/agent-readiness"
import { staticSitemapUrls } from "../../src/lib/sitemap"

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
    const authorization = discoveryRedirect(
      "/.well-known/oauth-authorization-server",
      "https://api.sleevy.app/",
    )
    const resource = discoveryRedirect(
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

  test("redirects the legacy extensionless Server Card alias", () => {
    const response = discoveryRedirect(
      "/.well-known/mcp-server-card",
      "https://api.sleevy.app/",
    )

    expect(response?.status).toBe(308)
    expect(response?.headers.get("location")).toBe(
      "https://api.sleevy.app/mcp/server-card",
    )
    expect(response?.headers.get("access-control-allow-origin")).toBe("*")
  })

  test("serves the well-known Server Card as a document rather than a redirect", async () => {
    // A client reading a well-known path should get the card. Redirecting it to
    // another origin costs a round trip and loses any reader that will not
    // follow a cross-origin hop for a discovery document.
    expect(
      discoveryRedirect("/.well-known/mcp/server-card.json", "https://api.sleevy.app/"),
    ).toBeNull()

    const card = await Bun.file(
      `${import.meta.dir}/../../public/.well-known/mcp/server-card.json`,
    ).json()

    // The fields a directory scanner reads before opening a transport.
    expect(card.name).toBe("app.sleevy/mcp")
    expect(card.version).toBe("1.0.0")
    expect(card.description.length).toBeGreaterThan(0)
    expect(card.serverUrl).toBe("https://api.sleevy.app/mcp")
    expect(card.tools.length).toBeGreaterThan(0)

    for (const tool of card.tools) {
      expect(typeof tool.name).toBe("string")
      expect(tool.description.length).toBeGreaterThan(0)
      expect(tool.requiredScopes.length).toBeGreaterThan(0)
    }
  })

  test("keeps the published Server Card in step with the API's own", async () => {
    // Both are built by `bun run generate:discovery` from one definition, so a
    // tool added to the catalogue cannot reach one card and miss the other.
    const [published, live] = await Promise.all([
      Bun.file(`${import.meta.dir}/../../public/.well-known/mcp/server-card.json`).json(),
      import("../../../api/src/modules/mcp/ServerCard.js").then(({ mcpServerCard }) =>
        mcpServerCard({
          apiBaseUrl: "https://api.sleevy.app",
          webUrl: "https://sleevy.app",
        })),
    ])

    expect(published).toEqual(JSON.parse(JSON.stringify(live)))
  })

  test("publishes a valid AI Catalog entry for every agent-facing resource", async () => {
    const catalog = await Bun.file(
      `${import.meta.dir}/../../public/.well-known/ai-catalog.json`,
    ).json()

    expect(catalog.specVersion).toBe("1.0")
    expect(catalog.entries.length).toBeGreaterThan(0)

    // The MCP Server Card is the entry a client follows to open a transport, so
    // it stays addressable at a fixed identifier.
    const serverCard = catalog.entries.find(
      (entry: { readonly identifier: string }) =>
        entry.identifier === "urn:air:sleevy.app:mcp:sleevy",
    )
    expect(serverCard.type).toBe("application/mcp-server-card+json")
    expect(serverCard.url).toBe("https://api.sleevy.app/mcp/server-card")

    for (const entry of catalog.entries) {
      // A catalog entry is only usable if a reader can name it, type it, and
      // fetch it — and exactly one of url or data may say where it lives.
      expect(entry.identifier).toMatch(/^urn:air:sleevy\.app:/)
      expect(typeof entry.displayName).toBe("string")
      expect(entry.displayName.length).toBeGreaterThan(0)
      expect(typeof entry.type).toBe("string")
      expect(("url" in entry) !== ("data" in entry)).toBe(true)

      // Progressive trust: each entry says who published it and what can be
      // checked, so a client can verify before it follows the link.
      expect(entry.trustManifest.identity.domain).toBe("sleevy.app")
      expect(entry.trustManifest.attestations.length).toBeGreaterThan(0)
      for (const attestation of entry.trustManifest.attestations) {
        expect(typeof attestation.type).toBe("string")
        expect(typeof attestation.claim).toBe("string")
        expect(attestation.evidence).toMatch(/^https:\/\//)
      }
    }
  })

  test("publishes an auth.md walkthrough with the sections the spec prescribes", async () => {
    const authMd = await Bun.file(`${import.meta.dir}/../../public/auth.md`).text()

    expect(authMd.startsWith("# ")).toBe(true)
    expect(authMd.length).toBeGreaterThan(200)

    for (const heading of [
      "## Discover",
      "## Pick a method",
      "## Register",
      "## Claim",
      "## Use the credential",
      "## Errors",
      "## Revocation",
    ]) {
      expect(authMd).toContain(heading)
    }

    // The anchor terms an agent greps for when it is looking for the shape of
    // the flow rather than reading the prose.
    for (const keyword of [
      "agent_auth",
      "register_uri",
      "identity_assertion",
      "id-jag",
      "WWW-Authenticate",
    ]) {
      expect(authMd).toContain(keyword)
    }
  })

  test("names AI crawlers explicitly in robots.txt without blocking any of them", async () => {
    const robots = await Bun.file(`${import.meta.dir}/../../public/robots.txt`).text()

    // A Content Signal states what may be done with what is fetched, which is a
    // separate question from whether it may be fetched.
    expect(robots).toContain("Content-Signal:")

    // Answer-engine crawlers get their own group. A named group replaces the
    // `*` group outright, so each one has to repeat the private paths.
    for (const agent of ["GPTBot", "ClaudeBot", "PerplexityBot", "OAI-SearchBot"]) {
      expect(robots).toContain(`User-agent: ${agent}`)
    }

    // Sleevy blocks no crawler: every group allows the public site and only the
    // account-private paths are held back.
    const groups = robots.split(/\n(?=User-agent:)/).slice(1)
    expect(groups.length).toBeGreaterThan(0)
    for (const group of groups) {
      expect(group).toContain("Allow: /")
      expect(group).not.toMatch(/^Disallow: \/$/m)
    }
  })

  test("publishes specific agent guidance and indexes every developer overview", async () => {
    const [agentIndex, instructions] = await Promise.all([
      Bun.file(`${import.meta.dir}/../../public/llms.txt`).text(),
      Bun.file(`${import.meta.dir}/../../public/agent-instructions.md`).text(),
    ])

    expect(agentIndex).toContain("## When to use Sleevy")
    expect(agentIndex).toContain("https://sleevy.app/agent-instructions.md")
    expect(instructions).toContain("## When to use Sleevy")
    expect(instructions).toContain("## When not to use Sleevy")

    const indexed = new Set(staticSitemapUrls.map(({ loc }) => loc))
    expect(indexed).toContain("https://sleevy.app/docs/overview")
    expect(indexed).toContain("https://sleevy.app/docs/mcp")
  })
})

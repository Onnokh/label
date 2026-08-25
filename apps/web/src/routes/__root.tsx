/// <reference types="vite/client" />
import { createRootRoute } from "@tanstack/react-router"
import { RootComponent } from "./-root-component"

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "description", content: "Sleevy is a scriptable bookmark manager app with an API for saving links from iOS, Raycast, Chrome, the web, scripts, and automations." },
      { title: "Sleevy - Scriptable Bookmark Manager App" },
      { property: "og:site_name", content: "Sleevy" },
      // Agents use og:type and og:image for entity resolution and attribution,
      // so both are stated site-wide rather than only where a page overrides
      // them. A route with a better image sets its own og:image after these.
      { property: "og:type", content: "website" },
      { property: "og:image", content: "https://sleevy.app/app-630.webp" },
      { property: "og:image:alt", content: "The Sleevy reading queue on iPhone" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "theme-color", content: "#1e2d65" },
    ],
    links: [
      { rel: "icon", href: "/favicon.ico", sizes: "16x16 32x32 48x48" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png", sizes: "180x180" },
      // The agent-facing index, and the machine-readable declarations behind it.
      { rel: "describedby", type: "text/markdown", href: "https://sleevy.app/llms.txt" },
      { rel: "service-desc", type: "application/vnd.oai.openapi+json", href: "https://sleevy.app/openapi.json" },
      { rel: "service-doc", type: "text/html", href: "https://sleevy.app/docs" },
    ],
  }),
  component: RootComponent,
})

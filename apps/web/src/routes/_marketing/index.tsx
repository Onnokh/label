import { createFileRoute } from "@tanstack/react-router"
import { HomePage } from "../../pages/home-page"

export const Route = createFileRoute("/_marketing/")({
  head: () => ({
    meta: [
      { title: "Sleevy | Bookmark Manager API & MCP Server for AI Agents" },
      { name: "description", content: "Sleevy is a personal bookmark manager with a read-later API and MCP server — save links from scripts, AI agents, iOS, Chrome, and Raycast into one synced queue." },
      { property: "og:title", content: "Sleevy | Bookmark Manager API & MCP Server for AI Agents" },
      { property: "og:description", content: "A personal bookmark manager with a read-later API and MCP server. Save links from scripts, AI agents, iOS, Chrome, and Raycast into one synced queue." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://sleevy.app/" },
      { name: "twitter:title", content: "Sleevy | Bookmark Manager API & MCP Server for AI Agents" },
      { name: "twitter:description", content: "A personal bookmark manager with a read-later API and MCP server. Save links from scripts, AI agents, iOS, Chrome, and Raycast into one synced queue." },
    ],
    links: [
      { rel: "canonical", href: "https://sleevy.app/" },
      // The hero blob layers are CSS background-images, so the browser only
      // discovers them after the stylesheet loads — too late for the first
      // paint they dominate (the back layer is the page's LCP element).
      // Preloading lets them fetch in parallel with the CSS.
      // High priority on the back layer: it is the LCP element, and by default
      // image preloads queue behind the (larger, entrance-delayed) phone image.
      { rel: "preload", as: "image", href: "/hero-blobs-back.avif", fetchPriority: "high" },
      { rel: "preload", as: "image", href: "/hero-blobs-front.avif" },
    ],
  }),
  component: HomePage,
})

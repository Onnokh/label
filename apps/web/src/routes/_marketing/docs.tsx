import { createFileRoute } from "@tanstack/react-router"
import { DocsPage } from "../../pages/docs-page"

export const Route = createFileRoute("/_marketing/docs")({
  head: () => ({
    meta: [
      { title: "Sleevy API Documentation | Capture Links from Anywhere" },
      { name: "description", content: "Learn how to use the Sleevy REST API to capture links, manage your read-later queue, and connect your own tools and automations." },
      { property: "og:title", content: "Sleevy API Documentation" },
      { property: "og:description", content: "Capture links and manage your read-later queue with the Sleevy REST API." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://sleevy.app/docs" },
      { name: "twitter:title", content: "Sleevy API Documentation" },
      { name: "twitter:description", content: "Capture links and manage your read-later queue with the Sleevy REST API." },
    ],
    links: [{ rel: "canonical", href: "https://sleevy.app/docs" }],
  }),
  component: DocsPage,
})

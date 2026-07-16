import { createFileRoute } from "@tanstack/react-router"
import { DocsPage } from "../../pages/docs-page"

export const Route = createFileRoute("/_marketing/docs")({
  head: () => ({
    meta: [
      { title: "Read-Later API Documentation: Save URLs | Sleevy" },
      { name: "description", content: "Use the Sleevy read-later API to save URLs, list saved links, and manage a personal reading queue from scripts and automations." },
      { property: "og:title", content: "Sleevy Read-Later API Documentation" },
      { property: "og:description", content: "Save URLs and manage your reading queue with the Sleevy REST API." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://sleevy.app/docs" },
      { name: "twitter:title", content: "Sleevy Read-Later API Documentation" },
      { name: "twitter:description", content: "Save URLs and manage your reading queue with the Sleevy REST API." },
    ],
    links: [{ rel: "canonical", href: "https://sleevy.app/docs" }],
  }),
  component: DocsPage,
})

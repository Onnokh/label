import { createFileRoute } from "@tanstack/react-router"
import { ContactPage } from "../../pages/contact-page"

export const Route = createFileRoute("/_marketing/contact")({
  head: () => ({
    meta: [
      { title: "Contact Sleevy | Support, Privacy, and Security" },
      { name: "description", content: "How to reach Sleevy: app support, privacy and data requests, security reports, and questions about the API and MCP server." },
      { property: "og:title", content: "Contact Sleevy" },
      { property: "og:description", content: "Support, privacy requests, security reports, and developer questions." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://sleevy.app/contact" },
      { name: "twitter:title", content: "Contact Sleevy" },
      { name: "twitter:description", content: "Support, privacy requests, security reports, and developer questions." },
    ],
    links: [{ rel: "canonical", href: "https://sleevy.app/contact" }],
  }),
  component: ContactPage,
})

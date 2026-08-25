import { createFileRoute } from "@tanstack/react-router"
import { AboutPage } from "../../pages/about-page"

export const Route = createFileRoute("/_marketing/about")({
  head: () => ({
    meta: [
      { title: "About Sleevy | The Scriptable Read-Later App" },
      { name: "description", content: "What Sleevy is, who it is for, and why it is built to be driven by scripts and AI agents as well as by people." },
      { property: "og:title", content: "About Sleevy" },
      { property: "og:description", content: "A read-later app that takes the link first and asks questions later — with a REST API and an MCP server." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://sleevy.app/about" },
      { name: "twitter:title", content: "About Sleevy" },
      { name: "twitter:description", content: "A read-later app that takes the link first and asks questions later." },
    ],
    links: [{ rel: "canonical", href: "https://sleevy.app/about" }],
  }),
  component: AboutPage,
})

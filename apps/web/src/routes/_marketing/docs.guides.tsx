import { createFileRoute } from "@tanstack/react-router"
import { DocsGuidesPage } from "../../pages/docs/docs-guides-page"

export const Route = createFileRoute("/_marketing/docs/guides")({
  head: () => ({ meta: [{ title: "Guides | Sleevy API" }, { name: "description", content: "Practical workflows for saving, querying, and organizing your reading list." }], links: [{ rel: "canonical", href: "https://sleevy.app/docs/guides" }] }),
  component: DocsGuidesPage,
})
